import { Fragment, useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";
import "./index.css";
import "./ElectoralStyles.css";
import LandingDashboard from "./LandingDashboard.jsx";
import LoginScreen from "./LoginScreen.jsx";
import { IconChartBar, IconShieldCheck, IconLogOut } from "./Icons.jsx";

// =========================================================
// API & CONSTANTS
// =========================================================

const GRAPHQL_API = import.meta.env.VITE_GRAPHQL_API || "http://127.0.0.1:8000/graphql";

async function graphqlRequest(query, variables = {}) {
  const response = await fetch(GRAPHQL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(
      payload.errors?.map((error) => error.message).join("; ") || "GraphQL request failed"
    );
  }
  return payload.data;
}

function getProperty(properties, names) {
  if (!properties) return "";
  const keys = Object.keys(properties);
  for (const name of names) {
    const key = keys.find(
      (k) => k.toLowerCase() === String(name).toLowerCase()
    );
    if (key !== undefined) return properties[key];
  }
  return "";
}

function normalizeCode(value) {
  if (value === null || value === undefined) return "";
  const str = String(value).trim();
  if (!str) return "";
  return str.replace(/^0+/, "") || "0";
}

const STATE_FIELDS = ["STNAME", "ST_NAME", "state_name", "State_Name", "STATE"];
const STATE_CODE_FIELDS = ["STCODE11", "ST_CODE", "State_LGD", "state_code"];
const DISTRICT_FIELDS = ["dtname", "DTNAME", "DIST_NAME", "dtname11", "district", "district_name"];
const DISTRICT_CODE_FIELDS = ["dtcode11", "DT_CODE", "Dist_LGD", "dist_lgd", "district_code"];
const ASSEMBLY_FIELDS = ["AC_NAME", "ac_name", "assembly", "assembly_name", "name"];
const ASSEMBLY_NUMBER_FIELDS = ["AC_NO", "ac_no", "acno", "ACNO", "assembly_no", "assembly_number"];
const ASSEMBLY_DISTRICT_FIELDS = ["dtcode11", "DT_CODE", "dist_lgd", "Dist_LGD", "district_code"];
const VILLAGE_FIELDS = ["village_name", "village", "Village_Name", "VILLAGE_NAME", "vilname11", "vilnam_soi", "name"];

const getStateName = (f) => getProperty(f?.properties, STATE_FIELDS);
const getStateCode = (f) => getProperty(f?.properties, STATE_CODE_FIELDS);
const getDistrictName = (f) => getProperty(f?.properties, DISTRICT_FIELDS);
const getDistrictCode = (f) => getProperty(f?.properties, DISTRICT_CODE_FIELDS);
const getAssemblyName = (f) => getProperty(f?.properties, ASSEMBLY_FIELDS);
const getAssemblyNumber = (f) => getProperty(f?.properties, ASSEMBLY_NUMBER_FIELDS);
const getAssemblyDistrictCode = (f) => getProperty(f?.properties, ASSEMBLY_DISTRICT_FIELDS);
const getVillageName = (f) => getProperty(f?.properties, VILLAGE_FIELDS);

function getFeatureCenter(feature) {
  const geometry = feature?.geometry;
  if (!geometry?.coordinates) return null;

  if (geometry.type === "Point") {
    const [lng, lat] = geometry.coordinates.map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }

  if (!["Polygon", "MultiPolygon"].includes(geometry.type)) return null;

  const points = [];
  function collect(value) {
    if (!Array.isArray(value)) return;
    if (
      value.length >= 2 &&
      Number.isFinite(Number(value[0])) &&
      Number.isFinite(Number(value[1]))
    ) {
      points.push([Number(value[0]), Number(value[1])]);
      return;
    }
    value.forEach(collect);
  }

  collect(geometry.coordinates);
  if (!points.length) return null;

  const lng = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const lat = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isNaN(number) ? value : number.toLocaleString("en-IN");
}

function formatPercent(value) {
  return value === null || value === undefined || value === "" ? "—" : `${value}%`;
}

const DEFAULT_THRESHOLDS = {
  tier1Max: 10,
  tier1Color: "#ef4444", // Red (< 10%)
  tier2Max: 25,
  tier2Color: "#f97316", // Amber (10-25%)
  tier3Max: 50,
  tier3Color: "#eab308", // Yellow (25-50%)
  tier4Color: "#22c55e", // Green (> 50%)
};

const DEFAULT_PARTY_COLORS = {
  RLD: "#16a34a",
  BJP: "#f97316",
  SP: "#ef4444",
  BSP: "#2563eb",
  INC: "#0284c7",
  AAP: "#0891b2",
  AIMIM: "#0d9488",
  ASP: "#9333ea",
  IND: "#64748b",
};

function getVotePercentageTier(pct, thresholds = DEFAULT_THRESHOLDS) {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) {
    return { tier: "none", label: "No data", color: "#334155" };
  }
  const val = Number(pct);
  if (val < thresholds.tier1Max) {
    return { tier: "red", label: `< ${thresholds.tier1Max}%`, color: thresholds.tier1Color };
  }
  if (val < thresholds.tier2Max) {
    return { tier: "amber", label: `${thresholds.tier1Max}-${thresholds.tier2Max}%`, color: thresholds.tier2Color };
  }
  if (val < thresholds.tier3Max) {
    return { tier: "yellow", label: `${thresholds.tier2Max}-${thresholds.tier3Max}%`, color: thresholds.tier3Color };
  }
  return { tier: "green", label: `> ${thresholds.tier3Max}%`, color: thresholds.tier4Color };
}

function SettingsModal({ thresholds, onSave, onClose }) {
  const [local, setLocal] = useState({ ...thresholds });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="tactical-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tactical-modal-header">
          <h3>
            <span>⚙</span> Threshold & Demarcation Settings
          </h3>
          <button type="button" className="dashboard-close" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        <div className="tactical-modal-body">
          <p style={{ margin: 0, fontSize: "11.5px", color: "#94a3b8", lineHeight: 1.5 }}>
            Configure the vote share % ranges and color codes used to demarcate assembly constituencies, villages, and polling booths.
          </p>

          <div>
            <div className="setting-section-title">VOTE PERCENTAGE THRESHOLDS & COLORS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* Tier 1: Red */}
              <div className="tier-config-row">
                <div className="tier-config-label">
                  <span className="tier-dot" style={{ backgroundColor: local.tier1Color, color: local.tier1Color }} />
                  <span>Tier 1 (Red)</span>
                </div>
                <div className="tier-range-inputs">
                  <span>Less than</span>
                  <input
                    type="number"
                    min="1"
                    max={Number(local.tier2Max) - 1}
                    value={local.tier1Max}
                    onChange={(e) => setLocal({ ...local, tier1Max: Number(e.target.value) })}
                    className="tier-input"
                  />
                  <span>%</span>
                </div>
                <input
                  type="color"
                  value={local.tier1Color}
                  onChange={(e) => setLocal({ ...local, tier1Color: e.target.value })}
                  className="color-picker-input"
                  title="Pick Tier 1 Color"
                />
              </div>

              {/* Tier 2: Amber */}
              <div className="tier-config-row">
                <div className="tier-config-label">
                  <span className="tier-dot" style={{ backgroundColor: local.tier2Color, color: local.tier2Color }} />
                  <span>Tier 2 (Amber)</span>
                </div>
                <div className="tier-range-inputs">
                  <span>{local.tier1Max}% to</span>
                  <input
                    type="number"
                    min={Number(local.tier1Max) + 1}
                    max={Number(local.tier3Max) - 1}
                    value={local.tier2Max}
                    onChange={(e) => setLocal({ ...local, tier2Max: Number(e.target.value) })}
                    className="tier-input"
                  />
                  <span>%</span>
                </div>
                <input
                  type="color"
                  value={local.tier2Color}
                  onChange={(e) => setLocal({ ...local, tier2Color: e.target.value })}
                  className="color-picker-input"
                  title="Pick Tier 2 Color"
                />
              </div>

              {/* Tier 3: Yellow */}
              <div className="tier-config-row">
                <div className="tier-config-label">
                  <span className="tier-dot" style={{ backgroundColor: local.tier3Color, color: local.tier3Color }} />
                  <span>Tier 3 (Yellow)</span>
                </div>
                <div className="tier-range-inputs">
                  <span>{local.tier2Max}% to</span>
                  <input
                    type="number"
                    min={Number(local.tier2Max) + 1}
                    max={99}
                    value={local.tier3Max}
                    onChange={(e) => setLocal({ ...local, tier3Max: Number(e.target.value) })}
                    className="tier-input"
                  />
                  <span>%</span>
                </div>
                <input
                  type="color"
                  value={local.tier3Color}
                  onChange={(e) => setLocal({ ...local, tier3Color: e.target.value })}
                  className="color-picker-input"
                  title="Pick Tier 3 Color"
                />
              </div>

              {/* Tier 4: Green */}
              <div className="tier-config-row">
                <div className="tier-config-label">
                  <span className="tier-dot" style={{ backgroundColor: local.tier4Color, color: local.tier4Color }} />
                  <span>Tier 4 (Green)</span>
                </div>
                <div className="tier-range-inputs">
                  <span>Greater than {local.tier3Max}%</span>
                </div>
                <input
                  type="color"
                  value={local.tier4Color}
                  onChange={(e) => setLocal({ ...local, tier4Color: e.target.value })}
                  className="color-picker-input"
                  title="Pick Tier 4 Color"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="tactical-modal-footer">
          <button
            type="button"
            className="tactical-btn"
            onClick={() => setLocal({ ...DEFAULT_THRESHOLDS })}
          >
            ↺ Reset Defaults
          </button>
          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" className="tactical-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="tactical-btn active"
              onClick={() => onSave(local)}
            >
              ✓ Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const ASSEMBLY_COLORS = [
  "#2563eb", "#7c3aed", "#db2777", "#dc2626",
  "#ea580c", "#ca8a04", "#16a34a", "#059669",
  "#0891b2", "#4f46e5", "#9333ea", "#e11d48",
  "#0d9488", "#65a30d", "#c026d3", "#0284c7",
];

function getAssemblyColor(number) {
  const n = parseInt(number, 10);
  return Number.isNaN(n) ? ASSEMBLY_COLORS[0] : ASSEMBLY_COLORS[Math.abs(n) % ASSEMBLY_COLORS.length];
}

// =========================================================
// SEARCHABLE SELECT
// =========================================================

function SearchSelect({ label, value, options, placeholder, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    return options.filter((option) =>
      String(option).toLowerCase().includes(search.toLowerCase())
    );
  }, [options, search]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setSearch("");
    }
  }, [disabled]);

  return (
    <div className="select-wrapper">
      <label className="field-label">{label}</label>
      <div
        className={`custom-select ${disabled ? "disabled" : ""}`}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(event) => {
          if (!disabled && ["Enter", " "].includes(event.key)) {
            event.preventDefault();
            setOpen((prev) => !prev);
          }
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <div className={value ? "selected-value" : "selected-value placeholder"}>
          {value || placeholder}
        </div>
        <span className="select-arrow">{open ? "⌃" : "⌄"}</span>
      </div>

      {open && !disabled && (
        <div className="select-dropdown" onClick={(event) => event.stopPropagation()}>
          <div className="search-box">
            <span>⌕</span>
            <input
              autoFocus
              placeholder={`Search ${label.toLowerCase()}...`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="options-list">
            {filteredOptions.length === 0 ? (
              <div className="no-option">No results found</div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={String(option)}
                  className={`option ${String(option) === String(value) ? "active-option" : ""}`}
                  onClick={() => {
                    onChange(option);
                    setSearch("");
                    setOpen(false);
                  }}
                >
                  <span>{option}</span>
                  {String(option) === String(value) && <span>✓</span>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================
// MAP AUTO ZOOM & BOUNDS
// =========================================================

function MapController({ selectedFeature, level, dashboardOpen }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedFeature) return;

    try {
      const bounds = L.geoJSON(selectedFeature).getBounds();
      if (!bounds.isValid()) return;

      const zoomLevels = { state: 7, district: 10, assembly: 12, village: 16 };

      map.flyToBounds(bounds, {
        paddingTopLeft: [40, 40],
        paddingBottomRight: dashboardOpen ? [420, 40] : [40, 40],
        duration: 1.1,
        easeLinearity: 0.2,
        maxZoom: zoomLevels[level] || 7,
      });
    } catch (error) {
      console.error("Map zoom error:", error);
    }
  }, [selectedFeature, level, map, dashboardOpen]);

  return null;
}

function MapInitialBounds({ featureCollection }) {
  const map = useMap();

  useEffect(() => {
    if (!featureCollection?.features?.length) return;
    const bounds = L.geoJSON(featureCollection).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 4.5 });
  }, [featureCollection, map]);

  return null;
}

// =========================================================
// MAP LAYER CONTROL
// =========================================================

const LAYER_CONFIG = [
  { key: "osm", title: "OSM Base Map", description: "Roads, places and map background", icon: "▦", color: "#0d9488" },
  { key: "states", title: "State Boundary", description: "State borders and outlines", icon: "⌂", color: "#64748b" },
  { key: "districts", title: "District Boundary", description: "District borders and outlines", icon: "▤", color: "#2563eb" },
  { key: "assemblies", title: "Assembly Boundary", description: "Constituency boundaries", icon: "▱", color: "#7c3aed" },
  { key: "villageBoundary", title: "Village Boundary", description: "Selected village polygon", icon: "⌖", color: "#0891b2" },
  { key: "villageHotspots", title: "Village Hotspots", description: "Village location markers", icon: "●", color: "#dc2626" },
];

function LayerSwitch({ checked, onChange }) {
  return (
    <button
      type="button"
      className={`layer-switch ${checked ? "is-on" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label="Toggle map layer"
      onClick={onChange}
    >
      <span />
    </button>
  );
}

function MapLayerControl({ layersVisible, toggleLayer, setAllLayers }) {
  const [open, setOpen] = useState(false);
  const activeCount = Object.values(layersVisible).filter(Boolean).length;

  return (
    <div className="map-layer-control">
      <button
        type="button"
        className="layer-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className="layer-trigger-icon">☷</span>
        <span>Map Layers</span>
        <span className="layer-count">{activeCount}</span>
        <span className="layer-chevron">{open ? "⌃" : "⌄"}</span>
      </button>

      {open && (
        <section className="layer-panel">
          <header className="layer-panel-header">
            <div>
              <strong>Map Layer Control</strong>
              <p>Manage your map visibility</p>
            </div>
            <button
              type="button"
              className="layer-close"
              onClick={() => setOpen(false)}
              aria-label="Close map layers"
            >
              ×
            </button>
          </header>

          <div className="layer-status">
            <span className={`layer-status-dot ${activeCount ? "active" : ""}`} />
            {activeCount} of {LAYER_CONFIG.length} layers visible
          </div>

          <div className="layer-items">
            {LAYER_CONFIG.map((layer) => {
              const checked = Boolean(layersVisible[layer.key]);
              return (
                <div className={`layer-item ${checked ? "" : "layer-disabled"}`} key={layer.key}>
                  <div
                    className="layer-item-icon"
                    style={{
                      color: layer.color,
                      background: `${layer.color}12`,
                      borderColor: `${layer.color}35`,
                    }}
                  >
                    {layer.icon}
                  </div>
                  <div className="layer-item-copy">
                    <strong>{layer.title}</strong>
                    <span>{layer.description}</span>
                  </div>
                  <LayerSwitch
                    checked={checked}
                    onChange={() => toggleLayer(layer.key)}
                  />
                </div>
              );
            })}
          </div>

          <footer className="layer-panel-footer">
            <button type="button" className="layer-show-all" onClick={() => setAllLayers(true)}>
              ✓ Show all
            </button>
            <button type="button" className="layer-hide-all" onClick={() => setAllLayers(false)}>
              Hide all
            </button>
          </footer>
        </section>
      )}
    </div>
  );
}

// =========================================================
// ASSEMBLY DASHBOARD
function AssemblyDashboard({
  data,
  loading,
  error,
  title,
  subtitle,
  onClose,
  onDownload,
  electionYears,
  selectedElectionYear,
  onElectionYearChange,
  level,
  targetParty,
  thresholds,
  tierFilter,
  setTierFilter,
  tierCounts,
}) {
  const [expandedBooths, setExpandedBooths] = useState({});
  const [boothSearch, setBoothSearch] = useState("");

  const toggleBooth = (boothId) => {
    setExpandedBooths((prev) => ({
      ...prev,
      [boothId]: !prev[boothId],
    }));
  };

  const booths = useMemo(() => data?.booths || [], [data?.booths]);
  const filteredBooths = useMemo(() => {
    if (!boothSearch.trim()) return booths;
    const term = boothSearch.trim().toLowerCase();
    return booths.filter(
      (b) =>
        String(b.booth_no || "").toLowerCase().includes(term) ||
        String(b.booth_name || "").toLowerCase().includes(term)
    );
  }, [booths, boothSearch]);

  // Compute booth-level tier counts if booths are available
  const boothTierCounts = useMemo(() => {
    const res = { red: 0, amber: 0, yellow: 0, green: 0, total: 0 };
    if (!booths.length || !targetParty) return res;
    booths.forEach((b) => {
      const pv = (b.party_votes || []).find((p) => p.party === targetParty);
      if (pv && pv.share_percent !== null && pv.share_percent !== undefined) {
        const tier = getVotePercentageTier(pv.share_percent, thresholds).tier;
        if (res[tier] !== undefined) res[tier] += 1;
        res.total += 1;
      }
    });
    return res;
  }, [booths, targetParty, thresholds]);

  if (loading) {
    return (
      <div className="assembly-dashboard">
        <div className="dashboard-header">
          <div>
            <div className="dashboard-eyebrow">POLL RESULTS</div>
            <h2>Loading...</h2>
          </div>
          <button className="dashboard-close" onClick={onClose} aria-label="Close dashboard">×</button>
        </div>
        <div className="dashboard-loading">
          <div className="dashboard-loader" />
          <p>Loading election results...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="assembly-dashboard">
        <div className="dashboard-header">
          <div>
            <div className="dashboard-eyebrow">POLL RESULTS</div>
            <h2>{title || "Data unavailable"}</h2>
          </div>
          <button className="dashboard-close" onClick={onClose} aria-label="Close dashboard">×</button>
        </div>
        <div className="dashboard-error">
          <strong>Unable to load poll results</strong>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const election = data.election || {};

  return (
    <div className="assembly-dashboard">
      <div className="dashboard-header">
        <div>
          <div className="dashboard-eyebrow">POLL RESULTS</div>
          <h2>{title || "Election results"}</h2>
          <div className="dashboard-subtitle">{subtitle}{election.year ? ` • ${election.year}` : ""}</div>
          <label className="year-picker"><span>Election year</span><select value={selectedElectionYear} onChange={(event) => onElectionYearChange(event.target.value)} disabled={!electionYears.length}><option value="">Latest available</option>{electionYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
        </div>
        <div className="dashboard-head-actions"><button type="button" className="dashboard-download" onClick={onDownload}>↓ CSV</button><button className="dashboard-close" onClick={onClose} aria-label="Close dashboard">×</button></div>
      </div>

      <div className="dashboard-scroll">
        <section className="dashboard-section">
          <div className="dashboard-section-title">01 · ELECTION</div>
          <div className="overview-grid">
            <div className="overview-card"><span>Election</span><strong>{election.name || election.type || "No results"}</strong></div>
            <div className="overview-card"><span>Year</span><strong>{election.year || "—"}</strong></div>
            <div className="overview-card"><span>Booths with results</span><strong>{formatNumber(data.booths_with_results)}</strong></div>
          </div>
        </section>

        {targetParty && (
          <section className="dashboard-section">
            <div className="dashboard-section-title">02 · DEMARCATION BREAKDOWN ({targetParty})</div>
            <div className="tier-metrics-container">
              <div className="tier-metrics-grid">
                {[
                  {
                    tier: "red",
                    name: "Red",
                    range: `< ${thresholds?.tier1Max ?? 10}%`,
                    color: thresholds?.tier1Color ?? "#ef4444",
                  },
                  {
                    tier: "amber",
                    name: "Amber",
                    range: `${thresholds?.tier1Max ?? 10}-${thresholds?.tier2Max ?? 25}%`,
                    color: thresholds?.tier2Color ?? "#f59e0b",
                  },
                  {
                    tier: "yellow",
                    name: "Yellow",
                    range: `${thresholds?.tier2Max ?? 25}-${thresholds?.tier3Max ?? 50}%`,
                    color: thresholds?.tier3Color ?? "#eab308",
                  },
                  {
                    tier: "green",
                    name: "Green",
                    range: `> ${thresholds?.tier3Max ?? 50}%`,
                    color: thresholds?.tier4Color ?? "#22c55e",
                  },
                ].map((item) => {
                  const isFiltered = tierFilter === item.tier;
                  const boothCount = boothTierCounts?.[item.tier] ?? 0;
                  const villageCount = tierCounts?.villages?.[item.tier] ?? 0;
                  const acCount = tierCounts?.assemblies?.[item.tier] ?? 0;
                  return (
                    <div
                      key={item.tier}
                      className={`tier-metric-cell ${isFiltered ? "active-metric" : ""}`}
                      style={{
                        borderColor: isFiltered ? item.color : undefined,
                        boxShadow: isFiltered ? `0 0 12px ${item.color}55` : undefined,
                      }}
                      onClick={() => setTierFilter?.((prev) => (prev === item.tier ? "all" : item.tier))}
                      title={`Click to filter by ${item.name} (${item.range})`}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="tier-metric-header">
                        <span className="tier-dot" style={{ backgroundColor: item.color, color: item.color }} />
                        <span className="tier-metric-name" style={{ color: item.color }}>{item.name}</span>
                      </div>
                      <span className="tier-metric-range">{item.range}</span>

                      <div className="tier-metric-counts">
                        {booths.length > 0 && (
                          <div className="tier-count-item">
                            <span>Booths:</span>
                            <strong>{boothCount}</strong>
                          </div>
                        )}
                        {(tierCounts?.villages?.total > 0 || level === "assembly" || level === "village") && (
                          <div className="tier-count-item">
                            <span>Villages:</span>
                            <strong>{villageCount}</strong>
                          </div>
                        )}
                        {(tierCounts?.assemblies?.total > 0 || level === "district" || level === "state") && (
                          <div className="tier-count-item">
                            <span>ACs:</span>
                            <strong>{acCount}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        <section className="dashboard-section">
          <div className="dashboard-section-title">03 · PARTY VOTE TOTALS</div>
          <div className="party-card">
            <div className="party-card-header"><div className="party-name">Party</div><div className="party-column-labels"><span>Votes</span><span>Share</span></div></div>
            {(data.party_votes || []).filter((party) => (party.votes || 0) > 0).map((party) => (
              <div className="band-row" key={party.party}>
                <div className="band-left"><span className="band-name">{party.party}</span></div>
                <div className="band-values"><strong>{formatNumber(party.votes)}</strong><span>{formatPercent(party.share_percent)}</span></div>
              </div>
            ))}
          </div>
        </section>

        <section className="dashboard-section">
          <div className="dashboard-section-title">04 · POLL TOTALS</div>
          <div className="checks-grid">
            {[
              ["Booth records", formatNumber(data.booth_records)],
              ["Electors", formatNumber(data.electors)],
              ["Votes polled", formatNumber(data.votes_polled)],
              ["Valid votes", formatNumber(data.valid_votes)],
            ].map(([label, value]) => (
              <div className="check-card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>

        {(level === "village" || booths.length > 0) && (
          <section className="dashboard-section">
            <div className="dashboard-section-title">
              05 · BOOTHS IN THIS VILLAGE {booths.length > 0 ? `(${booths.length})` : ""}
            </div>

            {booths.length > 3 && (
              <div className="booth-search-box">
                <input
                  type="text"
                  className="booth-search-input"
                  placeholder="Search booth name or number..."
                  value={boothSearch}
                  onChange={(e) => setBoothSearch(e.target.value)}
                />
              </div>
            )}

            {booths.length === 0 ? (
              <div className="booth-empty-notice">
                No booth records mapped for this village in the selected election.
              </div>
            ) : (
              <div className="booths-list">
                {filteredBooths.map((booth) => {
                  const isExpanded = Boolean(expandedBooths[booth.booth_id]);
                  const leading = booth.leading_party;
                  return (
                    <div className="booth-card" key={booth.booth_id || booth.booth_no}>
                      <div
                        className="booth-card-header"
                        onClick={() => toggleBooth(booth.booth_id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") toggleBooth(booth.booth_id);
                        }}
                      >
                        <div className="booth-card-top">
                          <span className="booth-no-badge">Booth #{booth.booth_no}</span>
                          {booth.turnout_percent !== null && booth.turnout_percent !== undefined && (
                            <span className="booth-turnout-badge">
                              {booth.turnout_percent}% Turnout
                            </span>
                          )}
                        </div>
                        <div className="booth-name">
                          {booth.booth_name || `Booth ${booth.booth_no}`}
                        </div>
                      </div>

                      <div className="booth-summary-row">
                        <div className="booth-summary-item">
                          <span>Electors</span>
                          <strong>{formatNumber(booth.electors)}</strong>
                        </div>
                        <div className="booth-summary-item">
                          <span>Polled</span>
                          <strong>{formatNumber(booth.votes_polled)}</strong>
                        </div>
                        <div className="booth-summary-item">
                          <span>Leading</span>
                          <strong title={leading ? `${leading.party}: ${formatNumber(leading.votes)} votes (${formatPercent(leading.share_percent)})` : "—"}>
                            {leading ? `${leading.party} (${formatPercent(leading.share_percent)})` : "—"}
                          </strong>
                        </div>
                      </div>

                      {booth.party_votes && booth.party_votes.length > 0 && (
                        <>
                          <button
                            type="button"
                            className="booth-breakdown-toggle"
                            onClick={() => toggleBooth(booth.booth_id)}
                            aria-expanded={isExpanded}
                          >
                            <span>{isExpanded ? "Hide party votes" : "Show party votes"}</span>
                            <span>{isExpanded ? "▲" : "▼"}</span>
                          </button>

                          {isExpanded && (
                            <div className="booth-party-breakdown">
                              <div className="booth-party-header">
                                <span>Party</span>
                                <div className="booth-party-col-labels">
                                  <span>Votes</span>
                                  <span>Share</span>
                                </div>
                              </div>
                              {booth.party_votes.map((pv) => (
                                <div className="booth-party-row" key={pv.party}>
                                  <span className="booth-party-name">{pv.party}</span>
                                  <div className="booth-party-vals">
                                    <span className="booth-party-votes">{formatNumber(pv.votes)}</span>
                                    <span className="booth-party-share">{formatPercent(pv.share_percent)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                {filteredBooths.length === 0 && (
                  <div className="booth-empty-notice">
                    No booths match &ldquo;{boothSearch}&rdquo;
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <div className="dashboard-source">
          <span className="source-dot" />
          Results aggregated from election booths and booth results
        </div>
      </div>
    </div>
  );
}

function CallReportsPanel({ reports, loading, error, title, onClose }) {
  return (
    <section className="call-reports-panel" aria-label="Call reports">
      <header className="call-reports-header">
        <div>
          <div className="dashboard-eyebrow">CALL REPORTS</div>
          <h2>{title}</h2>
          <p>Newest caller updates first · refreshes every 10 seconds</p>
        </div>
        <button type="button" className="dashboard-close" onClick={onClose} aria-label="Close call reports">×</button>
      </header>
      <div className="call-reports-list">
        {loading ? <div className="call-reports-empty">Loading reports…</div> : error ? (
          <div className="call-reports-error" role="alert">Could not load call reports: {error}</div>
        ) : reports.length ? reports.map((report) => (
          <article className="call-report-card" key={report.report_id}>
            <div className="call-report-meta">
              <time dateTime={report.occurred_at}>{new Date(report.occurred_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time>
              {report.category && <span>{report.category}</span>}
            </div>
            {(report.area || report.district) && <div className="call-report-area">{[report.area, report.district].filter(Boolean).join(" · ")}</div>}
            <p>{report.issue || "No issue reported"}</p>
            {report.feedback && <div className="call-report-caller">Feedback: {report.feedback}</div>}
          </article>
        )) : <div className="call-reports-empty">No call reports for this area yet.</div>}
      </div>
      {!loading && !error && reports.length === 100 && <footer className="call-reports-footer">Showing the latest 100 reports.</footer>}
    </section>
  );
}

// =========================================================
// MAIN APP COMPONENT
// =========================================================

export default function App() {
  const [states, setStates] = useState(null);
  const [districts, setDistricts] = useState(null);
  const [districtsLoading, setDistrictsLoading] = useState(false);
  const [districtsError, setDistrictsError] = useState("");
  const [assemblies, setAssemblies] = useState(null);
  const [assembliesLoading, setAssembliesLoading] = useState(false);

  const [villages, setVillages] = useState(null);
  const [villageLoading, setVillageLoading] = useState(false);
  const [villageError, setVillageError] = useState("");

  const [selectedState, setSelectedState] = useState("");
  const [selectedStateCode, setSelectedStateCode] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedDistrictCode, setSelectedDistrictCode] = useState("");
  const [selectedAssembly, setSelectedAssembly] = useState("");
  const [selectedAssemblyNumber, setSelectedAssemblyNumber] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get("ac") || "";
    } catch {
      return "";
    }
  });
  const [selectedVillage, setSelectedVillage] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get("village") || "";
    } catch {
      return "";
    }
  });
  const [selectedVillageFeature, setSelectedVillageFeature] = useState(null);

  const [selectedStateFeature, setSelectedStateFeature] = useState(null);
  const [selectedDistrictFeature, setSelectedDistrictFeature] = useState(null);
  const [selectedAssemblyFeature, setSelectedAssemblyFeature] = useState(null);

  const [mapLevel, setMapLevel] = useState("india");
  const [loading, setLoading] = useState(true);
  const [statesError, setStatesError] = useState("");

  const [layersVisible, setLayersVisible] = useState({
    osm: true,
    states: true,
    districts: true,
    assemblies: true,
    villageBoundary: true,
    villageHotspots: true,
  });

  const toggleLayer = (key) => {
    setLayersVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setAllLayers = (visible) => {
    setLayersVisible({
      osm: visible,
      states: visible,
      districts: visible,
      assemblies: visible,
      villageBoundary: visible,
      villageHotspots: visible,
    });
  };

  const [assemblyDashboard, setAssemblyDashboard] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [callReportsOpen, setCallReportsOpen] = useState(false);
  const [callReports, setCallReports] = useState([]);
  const [callReportsLoading, setCallReportsLoading] = useState(false);
  const [callReportsError, setCallReportsError] = useState("");
  const [comparisonRows, setComparisonRows] = useState([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [electionYears, setElectionYears] = useState([]);
  const [selectedElectionYear, setSelectedElectionYear] = useState("");
  const [electionYearsLoading, setElectionYearsLoading] = useState(false);
  const [electionScopeKey, setElectionScopeKey] = useState("");

  // Tactical Electoral Targeting & Settings States
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [thresholds, setThresholds] = useState(() => {
    try {
      const saved = localStorage.getItem("ei_thresholds");
      return saved ? JSON.parse(saved) : DEFAULT_THRESHOLDS;
    } catch {
      return DEFAULT_THRESHOLDS;
    }
  });

  const [targetParty, setTargetParty] = useState("RLD");
  const [secondaryParty, setSecondaryParty] = useState("BJP");
  const [tierFilter, setTierFilter] = useState("all"); // 'all' | 'amber' | 'red' | 'yellow' | 'green'

  const [activeView, setActiveView] = useState(() => {
    try {
      const pathname = window.location.pathname.toLowerCase();
      if (pathname === "/gis" || pathname.startsWith("/gis/")) return "gis";
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("view") === "gis") return "gis";
      return "landing";
    } catch {
      return "landing";
    }
  });

  // Admin authentication state: only administrators can view the dashboard
  const [authAdmin, setAuthAdmin] = useState(() => {
    try {
      const token = sessionStorage.getItem("gis-admin-token");
      const role = sessionStorage.getItem("gis-admin-role");
      const username = sessionStorage.getItem("gis-admin-user");
      if (token && role === "admin") {
        return { token, role, username: username || "admin" };
      }
      return null;
    } catch {
      return null;
    }
  });

  const handleAdminLogout = () => {
    try {
      sessionStorage.removeItem("gis-admin-token");
      sessionStorage.removeItem("gis-admin-role");
      sessionStorage.removeItem("gis-admin-user");
    } catch {}
    setAuthAdmin(null);
  };

  // Listen to browser forward/back buttons between / and /gis
  useEffect(() => {
    const handlePopState = () => {
      const pathname = window.location.pathname.toLowerCase();
      const urlParams = new URLSearchParams(window.location.search);
      if (pathname === "/gis" || pathname.startsWith("/gis/") || urlParams.get("view") === "gis") {
        setActiveView("gis");
      } else {
        setActiveView("landing");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleOpenGIS = (acNo, villageId, year) => {
    setActiveView("gis");
    try {
      const searchParams = new URLSearchParams(window.location.search);
      if (acNo) searchParams.set("ac", acNo);
      if (villageId) searchParams.set("village", villageId);
      if (year) searchParams.set("year", year);
      const searchStr = searchParams.toString() ? `?${searchParams.toString()}` : "";
      window.history.pushState({}, "", `/gis${searchStr}`);
    } catch {}
    if (year) {
      setSelectedElectionYear(Number(year));
    }
    if (acNo) {
      if (!selectedState) setSelectedState("UTTAR PRADESH");
      setSelectedAssemblyNumber(String(acNo));
    }
    if (villageId) {
      setSelectedVillage(String(villageId));
      setMapLevel("village");
    } else if (acNo) {
      setMapLevel("assembly");
    }
  };

  const handleOpenLanding = () => {
    setActiveView("landing");
    try {
      window.history.pushState({}, "", "/");
    } catch {}
  };

  const handleSaveThresholds = (updated) => {
    setThresholds(updated);
    try {
      localStorage.setItem("ei_thresholds", JSON.stringify(updated));
    } catch (e) {
      console.warn("Could not save thresholds to localStorage", e);
    }
    setSettingsOpen(false);
  };

  const currentScope = useMemo(() => ({
    state: selectedState || null,
    districtCode: selectedDistrictCode || null,
    acNo: selectedAssemblyNumber || null,
    villageIds: selectedVillageFeature
      ? [...new Set([
          ...(selectedVillageFeature.properties?.village_ids || []).map(Number),
          ...(selectedVillageFeature.properties?.village_id ? [Number(selectedVillageFeature.properties.village_id)] : []),
        ].filter(Number.isFinite))]
      : [],
    level: selectedVillage ? "village" : selectedAssemblyNumber ? "ac" : selectedDistrictCode ? "district" : "state",
  }), [selectedState, selectedDistrictCode, selectedAssemblyNumber, selectedVillage, selectedVillageFeature]);
  const currentScopeKey = JSON.stringify(currentScope);

  useEffect(() => {
    if (!selectedState) setCallReportsOpen(false);
  }, [selectedState]);

  const selectedVillageIds = useMemo(() => selectedVillageFeature
    ? [...new Set([
        ...(selectedVillageFeature.properties?.village_ids || []).map(Number),
        ...(selectedVillageFeature.properties?.village_id ? [Number(selectedVillageFeature.properties.village_id)] : []),
      ].filter(Number.isFinite))]
    : [], [selectedVillageFeature]);

  useEffect(() => {
    if (!selectedState || !callReportsOpen) return undefined;
    let cancelled = false;
    let firstLoad = true;
    const refreshReports = () => {
      if (firstLoad) setCallReportsLoading(true);
      setCallReportsError("");
      graphqlRequest(
        "query ($state: String, $districtCode: String, $acNo: String, $villageIds: [Int!], $level: String!, $limit: Int!) { callReports(state: $state, districtCode: $districtCode, acNo: $acNo, villageIds: $villageIds, level: $level, limit: $limit) }",
        { ...currentScope, villageIds: selectedVillage ? selectedVillageIds : [], limit: 100 }
      ).then((result) => {
        if (!cancelled) setCallReports(result.callReports || []);
      }).catch((error) => {
        if (!cancelled) setCallReportsError(error.message || "Unable to load call reports");
      }).finally(() => {
        if (!cancelled) setCallReportsLoading(false);
        firstLoad = false;
      });
    };
    refreshReports();
    const refreshTimer = window.setInterval(refreshReports, 10000);
    return () => { cancelled = true; window.clearInterval(refreshTimer); };
  }, [selectedState, selectedAssemblyNumber, selectedVillage, selectedVillageIds, currentScope, callReportsOpen]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedState) {
      setElectionYears([]);
      setSelectedElectionYear("");
      setElectionScopeKey("");
      setElectionYearsLoading(false);
      return () => { cancelled = true; };
    }
    setElectionYearsLoading(true);
    setElectionScopeKey("");
    graphqlRequest(
      "query ($state: String, $districtCode: String, $acNo: String, $villageIds: [Int!], $level: String!) { electionYears(state: $state, districtCode: $districtCode, acNo: $acNo, villageIds: $villageIds, level: $level) }",
      currentScope
    ).then((data) => {
      if (cancelled) return;
      const years = data.electionYears || [];
      setElectionYears(years);
      setSelectedElectionYear((current) => years.includes(Number(current)) ? String(current) : (years[0] ? String(years[0]) : ""));
      setElectionScopeKey(currentScopeKey);
    }).catch((error) => {
      if (!cancelled) {
        console.error("Election year loading error:", error);
        setElectionYears([]);
        setElectionScopeKey(currentScopeKey);
      }
    }).finally(() => { if (!cancelled) setElectionYearsLoading(false); });
    return () => { cancelled = true; };
  }, [currentScope, currentScopeKey, selectedState]);

  // Load states via GraphQL
  useEffect(() => {
    let cancelled = false;

    async function loadStates() {
      try {
        const data = await graphqlRequest(
          "query ($electionYear: Int) { states(electionYear: $electionYear) }",
          { electionYear: selectedElectionYear ? Number(selectedElectionYear) : null }
        );
        if (!cancelled) setStates(data.states);
      } catch (error) {
        console.error("State loading error:", error);
        if (!cancelled) setStatesError(error.message || "Unable to load states");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadStates();
    return () => { cancelled = true; };
  }, [selectedElectionYear]);

  // Load districts for selected state
  useEffect(() => {
    let cancelled = false;
    if (!selectedState) {
      setDistricts(null);
      setDistrictsLoading(false);
      return () => { cancelled = true; };
    }
    setDistrictsLoading(true);
    setDistrictsError("");
    graphqlRequest(
      "query ($state: String!, $electionYear: Int) { districts(state: $state, electionYear: $electionYear) }",
      {
        state: selectedState,
        electionYear: selectedElectionYear ? Number(selectedElectionYear) : null,
      }
    )
      .then((data) => {
        if (!cancelled) setDistricts(data.districts);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("District loading error:", error);
        setDistrictsError(error.message || "Unable to load districts");
      })
      .finally(() => {
        if (!cancelled) setDistrictsLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedState, selectedElectionYear]);

  // Load assemblies for selected district
  useEffect(() => {
    let cancelled = false;
    if (!selectedDistrictCode) {
      setAssemblies(null);
      setAssembliesLoading(false);
      return () => { cancelled = true; };
    }
    setAssembliesLoading(true);
    graphqlRequest(
      "query ($districtCode: String!, $electionYear: Int) { assemblies(districtCode: $districtCode, electionYear: $electionYear) }",
      {
        districtCode: String(selectedDistrictCode),
        electionYear: selectedElectionYear ? Number(selectedElectionYear) : null,
      }
    )
      .then((data) => {
        if (!cancelled) setAssemblies(data.assemblies);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Assembly loading error:", error);
          setAssemblies(null);
        }
      })
      .finally(() => {
        if (!cancelled) setAssembliesLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedDistrictCode, selectedElectionYear]);

  // Load poll results for the deepest selected level
  useEffect(() => {
    if (!selectedState) {
      setAssemblyDashboard(null);
      setDashboardOpen(false);
      setDashboardError("");
      return;
    }

    if (electionScopeKey !== currentScopeKey || electionYearsLoading) return;

    let cancelled = false;
    const variables = {
      ...currentScope,
      electionYear: selectedElectionYear ? Number(selectedElectionYear) : null,
    };

    async function loadPollResults() {
      setDashboardLoading(true);
      setDashboardError("");
      setDashboardOpen(true);

      try {
        const result = await graphqlRequest(
          "query ($state: String, $districtCode: String, $acNo: String, $villageIds: [Int!], $level: String!, $electionYear: Int) { pollResults(state: $state, districtCode: $districtCode, acNo: $acNo, villageIds: $villageIds, level: $level, electionYear: $electionYear) }",
          variables
        );
        const data = result.pollResults;
        if (!data) throw new Error("Poll result data is unavailable");
        if (cancelled) return;

        setAssemblyDashboard(data);
      } catch (error) {
        if (cancelled) return;
        console.error("Poll result loading error:", error);
        setAssemblyDashboard(null);
        setDashboardError(error.message || "Unable to load poll results");
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    }

    loadPollResults();
    return () => { cancelled = true; };
  }, [selectedState, currentScope, currentScopeKey, electionScopeKey, electionYearsLoading, selectedElectionYear]);

  // Load villages for selected AC
  useEffect(() => {
    if (!selectedAssemblyNumber) {
      setVillages(null);
      setVillageLoading(false);
      setVillageError("");
      setSelectedVillage("");
      setSelectedVillageFeature(null);
      return;
    }

    let cancelled = false;

    async function loadVillages() {
      setVillageLoading(true);
      setVillageError("");
      try {
        const result = await graphqlRequest(
          "query ($acNo: String!, $electionYear: Int) { villages(acNo: $acNo, electionYear: $electionYear) }",
          {
            acNo: String(selectedAssemblyNumber),
            electionYear: selectedElectionYear ? Number(selectedElectionYear) : null,
          }
        );
        const data = result.villages;
        if (!cancelled) setVillages(data);
      } catch (error) {
        if (!cancelled) {
          console.error("Village hotspot loading error:", error);
          setVillages(null);
          setVillageError(error.message || "Unable to load village data");
        }
      } finally {
        if (!cancelled) setVillageLoading(false);
      }
    }

    loadVillages();
    return () => { cancelled = true; };
  }, [selectedAssemblyNumber, selectedElectionYear]);

  // Keep selectedVillageFeature in sync when villages data updates (e.g. election year change or route param)
  useEffect(() => {
    if (selectedVillage && villages?.features) {
      const target = String(selectedVillage).trim().toLowerCase();
      const updatedFeature = villages.features.find((f) => {
        const vName = String(getVillageName(f) || "").trim().toLowerCase();
        const vId = String(f.properties?.village_id || f.properties?.objectid || "").trim().toLowerCase();
        return vName === target || vId === target;
      });
      if (updatedFeature) {
        setSelectedVillageFeature(updatedFeature);
        setSelectedVillage(getVillageName(updatedFeature));
        setMapLevel("village");
      }
    }
  }, [villages, selectedVillage]);

  const stateOptions = useMemo(() => {
    if (!states?.features) return [];
    return [...new Set(states.features.map(getStateName).filter(Boolean))].sort();
  }, [states]);

  const districtOptions = useMemo(() => {
    if (!districts?.features) return [];
    let feats = districts.features;
    if (tierFilter !== "all") {
      feats = feats.filter((f) => {
        const shares = f.properties?.party_shares || {};
        const share = shares[targetParty];
        if (share === undefined || share === null) return false;
        return getVotePercentageTier(share, thresholds).tier === tierFilter;
      });
    }
    return [...new Set(feats.map(getDistrictName).filter(Boolean))].sort();
  }, [districts, tierFilter, targetParty, thresholds]);

  const assemblyOptions = useMemo(() => {
    if (!assemblies?.features || !selectedDistrictCode) return [];
    let feats = assemblies.features;
    if (tierFilter !== "all") {
      feats = feats.filter((f) => {
        const shares = f.properties?.party_shares || {};
        const share = shares[targetParty];
        if (share === undefined || share === null) return false;
        return getVotePercentageTier(share, thresholds).tier === tierFilter;
      });
    }
    return [...new Set(feats.map(getAssemblyName).filter(Boolean))].sort();
  }, [assemblies, selectedDistrictCode, tierFilter, targetParty, thresholds]);

  const villageOptions = useMemo(() => {
    if (!villages?.features) return [];
    let feats = villages.features;
    if (tierFilter !== "all") {
      feats = feats.filter((f) => {
        const shares = f.properties?.party_shares || {};
        const share = shares[targetParty];
        if (share === undefined || share === null || !(f.properties?.votes_polled > 0)) return false;
        return getVotePercentageTier(share, thresholds).tier === tierFilter;
      });
    }
    const names = feats
      .map(getVillageName)
      .map((name) => String(name || "").trim())
      .filter(Boolean);
    return [...new Set(names)].sort((a, b) =>
      a.localeCompare(b, "en", { sensitivity: "base" })
    );
  }, [villages, tierFilter, targetParty, thresholds]);

  const currentLevel = selectedVillage
    ? "Village"
    : selectedAssembly
    ? "Assembly"
    : selectedDistrict
    ? "District"
    : selectedState
    ? "State"
    : "India";

  const currentLevelFilterMatchCount = useMemo(() => {
    if (tierFilter === "all") return 1;
    if (currentLevel === "Village") {
      if (!villages?.features) return 0;
      return villages.features.filter((f) => {
        const shares = f.properties?.party_shares || {};
        const share = shares[targetParty];
        return share !== undefined && share !== null && f.properties?.votes_polled > 0 && getVotePercentageTier(share, thresholds).tier === tierFilter;
      }).length;
    }
    if (currentLevel === "Assembly") {
      if (!assemblies?.features) return 0;
      return assemblies.features.filter((f) => {
        const districtCode = getAssemblyDistrictCode(f);
        const inDistrict = !selectedDistrictCode || normalizeCode(districtCode) === normalizeCode(selectedDistrictCode);
        if (!inDistrict) return false;
        const shares = f.properties?.party_shares || {};
        const share = shares[targetParty];
        return share !== undefined && share !== null && getVotePercentageTier(share, thresholds).tier === tierFilter;
      }).length;
    }
    if (currentLevel === "District") {
      if (!districts?.features) return 0;
      return districts.features.filter((f) => {
        const shares = f.properties?.party_shares || {};
        const share = shares[targetParty];
        return share !== undefined && share !== null && getVotePercentageTier(share, thresholds).tier === tierFilter;
      }).length;
    }
    if (currentLevel === "State" || currentLevel === "India") {
      if (!states?.features) return 0;
      return states.features.filter((f) => {
        const shares = f.properties?.party_shares || {};
        const share = shares[targetParty];
        return share !== undefined && share !== null && getVotePercentageTier(share, thresholds).tier === tierFilter;
      }).length;
    }
    return 1;
  }, [currentLevel, tierFilter, villages, assemblies, districts, states, targetParty, thresholds, selectedDistrictCode]);

  const scopeTierCounts = useMemo(() => {
    const counts = {
      villages: { red: 0, amber: 0, yellow: 0, green: 0, total: 0 },
      assemblies: { red: 0, amber: 0, yellow: 0, green: 0, total: 0 },
      districts: { red: 0, amber: 0, yellow: 0, green: 0, total: 0 },
    };

    if (villages?.features) {
      villages.features.forEach((f) => {
        const share = f.properties?.party_shares?.[targetParty];
        if (share !== undefined && share !== null && f.properties?.votes_polled > 0) {
          const t = getVotePercentageTier(share, thresholds).tier;
          if (counts.villages[t] !== undefined) counts.villages[t] += 1;
          counts.villages.total += 1;
        }
      });
    }

    if (assemblies?.features) {
      assemblies.features.forEach((f) => {
        const districtCode = getAssemblyDistrictCode(f);
        const inDistrict = !selectedDistrictCode || normalizeCode(districtCode) === normalizeCode(selectedDistrictCode);
        if (inDistrict) {
          const share = f.properties?.party_shares?.[targetParty];
          if (share !== undefined && share !== null) {
            const t = getVotePercentageTier(share, thresholds).tier;
            if (counts.assemblies[t] !== undefined) counts.assemblies[t] += 1;
            counts.assemblies.total += 1;
          }
        }
      });
    }

    if (districts?.features) {
      districts.features.forEach((f) => {
        const share = f.properties?.party_shares?.[targetParty];
        if (share !== undefined && share !== null) {
          const t = getVotePercentageTier(share, thresholds).tier;
          if (counts.districts[t] !== undefined) counts.districts[t] += 1;
          counts.districts.total += 1;
        }
      });
    }

    return counts;
  }, [villages, assemblies, districts, targetParty, thresholds, selectedDistrictCode]);

  const assembliesHaveBoundaries = Boolean(assemblies?.features?.some((feature) => feature.geometry));
  const villagesHaveGeometry = Boolean(villages?.features?.some((feature) => feature.geometry));

  function handleStateChange(stateName) {
    const feature = states?.features?.find(
      (item) => String(getStateName(item)).trim().toLowerCase() === String(stateName).trim().toLowerCase()
    );
    if (!feature) return;

    setSelectedState(String(stateName).trim());
    setSelectedStateCode(String(getStateCode(feature)));
    setSelectedDistrict("");
    setSelectedDistrictCode("");
    setSelectedAssembly("");
    setSelectedAssemblyNumber("");
    setSelectedVillage("");
    setSelectedVillageFeature(null);
    setSelectedStateFeature(feature);
    setSelectedDistrictFeature(null);
    setSelectedAssemblyFeature(null);
    setAssemblyDashboard(null);
    setDashboardError("");
    setDashboardOpen(false);
    setMapLevel("state");
  }

  function handleDistrictChange(districtName) {
    const feature = districts?.features?.find(
      (item) => String(getDistrictName(item)).trim().toLowerCase() === String(districtName).trim().toLowerCase()
    );
    if (!feature) return;

    setSelectedDistrict(districtName);
    setSelectedDistrictCode(String(getDistrictCode(feature)));
    setSelectedAssembly("");
    setSelectedAssemblyNumber("");
    setSelectedVillage("");
    setSelectedVillageFeature(null);
    setSelectedDistrictFeature(feature);
    setSelectedAssemblyFeature(null);
    setAssemblyDashboard(null);
    setDashboardOpen(false);
    setDashboardError("");
    setMapLevel("district");
  }

  function handleAssemblyChange(assemblyName) {
    if (!selectedDistrictCode) return;

    const feature = assemblies?.features?.find((item) =>
      String(getAssemblyName(item)).trim().toLowerCase() === String(assemblyName).trim().toLowerCase()
    );
    if (!feature) return;

    const assemblyNumber = getAssemblyNumber(feature);
    setSelectedAssembly(assemblyName);
    setSelectedAssemblyNumber(String(assemblyNumber));
    setSelectedVillage("");
    setSelectedVillageFeature(null);
    setSelectedAssemblyFeature(feature);
    setMapLevel("assembly");
  }

  function handleVillageChange(villageName) {
    if (!selectedAssemblyNumber || !villages?.features) return;

    const feature = villages.features.find(
      (item) => String(getVillageName(item) || "").trim().toLowerCase() === String(villageName).trim().toLowerCase()
    );
    if (!feature) return;

    setSelectedVillage(villageName);
    setSelectedVillageFeature(feature);
    setMapLevel("village");
  }

  function handleStateClick(feature) {
    const name = getStateName(feature);
    if (name) handleStateChange(name);
  }

  function handleDistrictClick(feature) {
    const name = getDistrictName(feature);
    if (name) handleDistrictChange(name);
  }

  function handleAssemblyClick(feature) {
    const name = getAssemblyName(feature);
    if (name) handleAssemblyChange(name);
  }

  function closeDashboard() {
    setDashboardOpen(false);
  }

  const activeGeography = {
    label: [selectedState, selectedDistrict, selectedAssembly, selectedVillage].filter(Boolean).join(" / ") || "India",
    location: [selectedState, selectedDistrict, selectedAssembly, selectedVillage].filter(Boolean).join(" / ") || "India",
    level: selectedVillage ? "village" : selectedAssemblyNumber ? "ac" : selectedDistrictCode ? "district" : "state",
    state: selectedState || null,
    districtCode: selectedDistrictCode || null,
    acNo: selectedAssemblyNumber || null,
    villageIds: selectedVillageFeature
      ? [...new Set([
          ...(selectedVillageFeature.properties?.village_ids || []).map(Number),
          ...(selectedVillageFeature.properties?.village_id ? [Number(selectedVillageFeature.properties.village_id)] : []),
        ].filter(Number.isFinite))]
      : [],
    electionYear: selectedElectionYear ? Number(selectedElectionYear) : null,
  };

  async function addCurrentToComparison() {
    if (!selectedState || comparisonLoading) return;
    const comparisonLabel = `${activeGeography.label} · ${selectedElectionYear || "Latest"}`;
    if (comparisonRows.some((row) => row.label === comparisonLabel)) return;
    setComparisonLoading(true);
    try {
      const data = await graphqlRequest(
        "query ($state: String, $districtCode: String, $acNo: String, $villageIds: [Int!], $level: String!, $electionYear: Int) { pollResults(state: $state, districtCode: $districtCode, acNo: $acNo, villageIds: $villageIds, level: $level, electionYear: $electionYear) }",
        activeGeography
      );
      setComparisonRows((rows) => rows.some((row) => row.label === comparisonLabel)
        ? rows
        : [...rows, { ...activeGeography, label: comparisonLabel, data: data.pollResults }]);
    } catch (error) {
      setDashboardError(error.message || "Unable to load comparison results");
    } finally {
      setComparisonLoading(false);
    }
  }

  function downloadReport() {
    const rows = comparisonRows.length ? comparisonRows : (assemblyDashboard ? [{ ...activeGeography, data: assemblyDashboard }] : []);
    const lines = [["Location", "Level", "Election", "Year", "Booths with results", "Booth records", "Booth #", "Booth Name", "Electors", "Votes polled", "Valid votes", "Party", "Party votes", "Party share", "Visible layers"]];
    const visibleLayers = LAYER_CONFIG.filter((layer) => layersVisible[layer.key]).map((layer) => layer.title).join("; ");
    rows.forEach((row) => {
      const data = row.data || {};
      const visibleParties = (data.party_votes || []).filter((party) => (party.votes || 0) > 0);
      const parties = visibleParties.length ? visibleParties : [null];
      parties.forEach((party) => lines.push([
        row.location || row.label, row.level, data.election?.name || data.election?.type || "", data.election?.year || row.electionYear || "",
        data.booths_with_results ?? "", data.booth_records ?? "", "ALL", "Total", data.electors ?? "", data.votes_polled ?? "",
        data.valid_votes ?? "", party?.party || "", party?.votes ?? "", party?.share_percent ?? "", visibleLayers,
      ]));
      if (Array.isArray(data.booths) && data.booths.length > 0) {
        data.booths.forEach((b) => {
          const bParties = (b.party_votes || []).filter((p) => (p.votes || 0) > 0);
          const activeBParties = bParties.length ? bParties : [null];
          activeBParties.forEach((p) => {
            lines.push([
              row.location || row.label, "booth", data.election?.name || data.election?.type || "", data.election?.year || row.electionYear || "",
              "1", "1", b.booth_no || "", b.booth_name || "", b.electors ?? "", b.votes_polled ?? "",
              b.valid_votes ?? "", p?.party || "", p?.votes ?? "", p?.share_percent ?? "", visibleLayers,
            ]);
          });
        });
      }
    });
    const csv = lines.map((line) => line.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `electoral-report-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function resetMap() {
    setSelectedState("");
    setSelectedStateCode("");
    setSelectedDistrict("");
    setSelectedDistrictCode("");
    setSelectedAssembly("");
    setSelectedAssemblyNumber("");
    setSelectedVillage("");
    setSelectedVillageFeature(null);
    setSelectedStateFeature(null);
    setSelectedDistrictFeature(null);
    setSelectedAssemblyFeature(null);
    setAssemblyDashboard(null);
    setDashboardError("");
    setDashboardOpen(false);
    setTierFilter("all");
    setMapLevel("india");
  }

  function goBack() {
    if (selectedVillage) {
      setSelectedVillage("");
      setSelectedVillageFeature(null);
      setMapLevel("assembly");
      return;
    }

    if (selectedAssembly) {
      setSelectedAssembly("");
      setSelectedAssemblyNumber("");
      setSelectedVillage("");
      setSelectedVillageFeature(null);
      setSelectedAssemblyFeature(null);
      setAssemblyDashboard(null);
      setDashboardError("");
      setDashboardOpen(false);
      setMapLevel("district");
      return;
    }

    if (selectedDistrict) {
      setSelectedDistrict("");
      setSelectedDistrictCode("");
      setSelectedDistrictFeature(null);
      setSelectedAssembly("");
      setSelectedAssemblyNumber("");
      setSelectedAssemblyFeature(null);
      setAssemblyDashboard(null);
      setDashboardError("");
      setDashboardOpen(false);
      setMapLevel("state");
      return;
    }

    if (selectedState) resetMap();
  };

  if (!authAdmin) {
    return <LoginScreen onLoginSuccess={(adminData) => setAuthAdmin(adminData)} />;
  }

  if (activeView === "landing") {
    return (
      <LandingDashboard
        onOpenGIS={handleOpenGIS}
        initialAC={selectedAssemblyNumber || "49"}
        initialVillage={selectedVillage || ""}
        initialElectionYear={selectedElectionYear ? String(selectedElectionYear) : "2022"}
        authAdmin={authAdmin}
        onLogout={handleAdminLogout}
      />
    );
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">EI</div>
        <div className="loader" />
        <h2>Electoral Intelligence</h2>
        <p>Initializing GIS layers...</p>
      </div>
    );
  }

  const currentLocation =
    selectedVillage || selectedAssembly || selectedDistrict || selectedState || "India";
  const dashboardTitle = currentLocation;
  const dashboardSubtitle = [selectedState, selectedDistrict, selectedAssembly, selectedVillage]
    .filter(Boolean)
    .join(" / ");

  return (
    <div className="app">
      <header className="header">
        <div className="brand-area">
          <div className="brand-icon">EI</div>
          <div>
            <div className="brand">Electoral Intelligence</div>
            <div className="subtitle">Geospatial Political Analytics</div>
          </div>
        </div>

        <div className="header-right">
          <div className="target-party-bar">
            <span className="target-party-tag">Target:</span>
            <span className="target-party-fixed" title="Fixed primary analysis party">RLD</span>

            <span className="target-party-tag" style={{ marginLeft: "4px" }}>vs</span>
            <select
              value={secondaryParty}
              onChange={(e) => setSecondaryParty(e.target.value)}
              className="target-party-select"
              title="Select Comparison Party"
            >
              <option value="BJP">BJP</option>
              <option value="SP">SP</option>
              <option value="BSP">BSP</option>
              <option value="INC">INC</option>
              <option value="AAP">AAP</option>
              <option value="AIMIM">AIMIM</option>
              <option value="ASP">ASP</option>
              <option value="none">— None —</option>
            </select>
          </div>

          <div className="tier-filter-bar">
            <span className="tier-filter-tag">Filter:</span>
            <div className="tier-filter-buttons">
              <button
                type="button"
                className={`tier-filter-chip ${tierFilter === "all" ? "active" : ""}`}
                onClick={() => setTierFilter("all")}
                title="Show all tiers"
              >
                All
              </button>
              <button
                type="button"
                className={`tier-filter-chip amber-toggle ${tierFilter === "amber" ? "active" : ""}`}
                onClick={() => setTierFilter((prev) => (prev === "amber" ? "all" : "amber"))}
                title={`Filter Amber (${thresholds.tier1Max}-${thresholds.tier2Max}%) across ${currentLevel}s`}
              >
                <span className="tier-dot" style={{ backgroundColor: thresholds.tier2Color }} />
                <span>Amber Only</span>
                {tierFilter === "amber" && <span className="tier-active-badge">ON</span>}
              </button>
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                className="tier-filter-dropdown"
                title="Filter by Demarcation Tier"
              >
                <option value="all">All Tiers</option>
                <option value="amber">⚡ Amber ({thresholds.tier1Max}-{thresholds.tier2Max}%)</option>
                <option value="red">Red (&lt; {thresholds.tier1Max}%)</option>
                <option value="yellow">Yellow ({thresholds.tier2Max}-{thresholds.tier3Max}%)</option>
                <option value="green">Green (&gt; {thresholds.tier3Max}%)</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            className="tactical-btn"
            onClick={() => setSettingsOpen(true)}
            title="Configure Thresholds & Colors"
          >
            <span>⚙</span> Thresholds
          </button>

          <div className="system-status">
            <span className="status-dot" />
            GIS SYSTEM
          </div>
          <button
            type="button"
            className="analytics-view-toggle-btn"
            onClick={handleOpenLanding}
            title="Return to Analytics Landing Page (Full Graphs, No Map)"
          >
            <IconChartBar size={14} /> Landing Page
          </button>
          <button className="reset-button" onClick={resetMap}>
            <span>↻</span> Reset
          </button>

          {authAdmin && (
            <div className="admin-status-cluster" style={{ marginLeft: "4px" }}>
              <span className="admin-badge-pill" title={`Signed in as Administrator: ${authAdmin.username}`}>
                <IconShieldCheck size={12} />
                <span>Admin: {authAdmin.username}</span>
              </span>
              <button
                type="button"
                className="admin-signout-btn"
                onClick={handleAdminLogout}
                title="Sign out of Admin session"
              >
                <IconLogOut size={12} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="main-layout">
        <aside className="sidebar">
          <div className="sidebar-scroll">
            <div className="explorer-header">
              <div>
                <div className="eyebrow">LOCATION EXPLORER</div>
                <h2>Explore Electoral Map</h2>
              </div>
              <div className="level-badge">{currentLevel}</div>
            </div>

            <div className="selectors">
              <SearchSelect
                label="State"
                value={selectedState}
                options={stateOptions}
                placeholder={loading ? "Loading states..." : statesError ? "States unavailable" : stateOptions.length ? "Select state" : "No states found"}
                disabled={loading || stateOptions.length === 0}
                onChange={handleStateChange}
              />
              <SearchSelect
                label="District"
                value={selectedDistrict}
                options={districtOptions}
                placeholder={districtsLoading ? "Loading districts..." : districtsError ? "District data unavailable" : districtOptions.length ? "Select district" : "No districts found"}
                disabled={!selectedState || districtsLoading}
                onChange={handleDistrictChange}
              />
              <SearchSelect
                label="Assembly Constituency"
                value={selectedAssembly}
                options={assemblyOptions}
                placeholder={!selectedDistrict ? "Select district first" : assembliesLoading ? "Loading assemblies..." : assemblyOptions.length ? "Select assembly" : "No assemblies found"}
                disabled={!selectedDistrict || assembliesLoading}
                onChange={handleAssemblyChange}
              />
              <SearchSelect
                label="Village"
                value={selectedVillage}
                options={villageOptions}
                placeholder={
                  selectedAssembly
                    ? villageLoading
                      ? "Loading villages..."
                      : villageError
                      ? "Village data unavailable"
                      : villageOptions.length
                      ? "Select village"
                      : "No villages found"
                    : "Select assembly first"
                }
                disabled={!selectedAssembly || villageLoading || villageOptions.length === 0}
                onChange={handleVillageChange}
              />
              {villageError && (
                <div className="selector-error" role="alert">
                  Village data could not be loaded. Check the API/database logs and confirm the village mapping SQL has been applied.
                </div>
              )}
            </div>

            <div className="path-card">
              <div className="path-label">CURRENT LOCATION</div>
              <div className="path-current">{currentLocation}</div>
              <div className="path-breadcrumb">
                India
                {selectedState && ` / ${selectedState}`}
                {selectedDistrict && ` / ${selectedDistrict}`}
                {selectedAssembly && ` / ${selectedAssembly}`}
                {selectedVillage && ` / ${selectedVillage}`}
              </div>
            </div>

            <section className="compare-tools">
              <div className="compare-tools-heading">
                <div><div className="path-label">COMPARE AREAS</div><strong>{comparisonRows.length} selected</strong></div>
                <button type="button" className="compare-add" onClick={addCurrentToComparison} disabled={!selectedState || comparisonLoading || electionYearsLoading || comparisonRows.some((row) => row.label === `${activeGeography.label} · ${selectedElectionYear || "Latest"}`)}>
                  {comparisonLoading ? "Adding…" : "+ Add current"}
                </button>
              </div>
              <p>Add a state, district, assembly or village, then navigate to another area and add it too.</p>
              {comparisonRows.length > 0 && <div className="compare-chips">{comparisonRows.map((row) => <button type="button" key={row.label} onClick={() => setComparisonRows((items) => items.filter((item) => item.label !== row.label))} title="Remove from comparison">{row.label} <span>×</span></button>)}</div>}
            </section>

            {(selectedState || selectedDistrict || selectedAssembly) && (
              <button className="back-button" onClick={goBack}>
                ← Back to previous level
              </button>
            )}

            {selectedState && (
              <button type="button" className="call-reports-open" onClick={() => setCallReportsOpen(true)}>
                <span>◷</span> Call reported issues
              </button>
            )}

            <div className="sidebar-section">
              <div className="section-heading">DATA OVERVIEW</div>
              <div className="stats-grid">
                <div className="stat-card">
                  <span className="stat-icon">◫</span>
                  <div>
                    <strong>{selectedState ? districts?.features?.length || 0 : "—"}</strong>
                    <small>Districts</small>
                  </div>
                </div>
                <div className="stat-card">
                  <span className="stat-icon">◈</span>
                  <div>
                    <strong>{selectedDistrict ? assemblyOptions.length : "—"}</strong>
                    <small>Assemblies</small>
                  </div>
                </div>
              </div>
            </div>

            <div className="sidebar-section">
              <div className="section-heading">MAP LEGEND</div>
              <div className="legend-list">
                {[
                  ["state-line", "State boundary", "states"],
                  ["district-line", "District boundary", "districts"],
                  ["assembly-line", "Assembly boundary", "assemblies"],
                ].map(([className, label, layerKey]) => (
                  <div
                    className="legend-row"
                    key={layerKey}
                    style={{ opacity: layersVisible[layerKey] ? 1 : 0.4 }}
                  >
                    <span className={`legend-line ${className}`} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="instruction-card">
              <div className="instruction-icon">✦</div>
              <div>
                <strong>Explore the map</strong>
                <p>Click a boundary or use the selectors to explore the next electoral level.</p>
              </div>
            </div>
          </div>
        </aside>

        <main className="map-container">
          <MapContainer
            center={[22.5, 79.0]}
            zoom={4}
            minZoom={4}
            maxZoom={18}
            scrollWheelZoom
            zoomControl
            className="map"
          >
            <MapInitialBounds featureCollection={states} />
            {layersVisible.osm && (
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            )}

            {layersVisible.states && states && (
              <GeoJSON
                key={`india-states-${selectedElectionYear || "latest"}-${targetParty}-${thresholds.tier1Max}-${thresholds.tier2Max}-${thresholds.tier3Max}-${tierFilter}`}
                data={states}
                filter={(feature) => {
                  if (tierFilter && tierFilter !== "all") {
                    const shares = feature.properties?.party_shares || {};
                    const targetShare = shares[targetParty];
                    if (targetShare === undefined || targetShare === null) return false;
                    const tier = getVotePercentageTier(targetShare, thresholds);
                    if (tier.tier !== tierFilter) return false;
                  }
                  return true;
                }}
                style={(feature) => {
                  const selected =
                    normalizeCode(getStateCode(feature)) === normalizeCode(selectedStateCode);
                  const shares = feature.properties?.party_shares || {};
                  const targetShare = shares[targetParty];
                  const hasData = targetShare !== undefined && targetShare !== null;
                  const tier = getVotePercentageTier(targetShare, thresholds);
                  return {
                    color: selected ? "#38bdf8" : (hasData ? tier.color : "#334155"),
                    weight: selected ? 3 : 1.2,
                    fillColor: hasData ? tier.color : (selected ? "#1e293b" : "#0f172a"),
                    fillOpacity: selected ? 0.55 : (hasData ? 0.35 : 0.12),
                  };
                }}
                onEachFeature={(feature, layer) => {
                  const name = getStateName(feature) || "State";
                  const shares = feature.properties?.party_shares || {};
                  const targetShare = shares[targetParty];
                  const hasData = targetShare !== undefined && targetShare !== null;
                  const tier = getVotePercentageTier(targetShare, thresholds);

                  let tooltipHtml = `<strong>${name}</strong>`;
                  if (hasData) {
                    tooltipHtml += `<br/><span style="display:inline-block;width:8px;height:8px;background:${tier.color};border-radius:2px;margin-right:4px;"></span>${targetParty}: <b>${targetShare}%</b> (${tier.tier.toUpperCase()})`;
                  }
                  layer.bindTooltip(tooltipHtml, { sticky: true });
                  layer.on({
                    click: () => handleStateClick(feature),
                    mouseover: (event) => event.target.setStyle({ weight: 2.8, fillOpacity: 0.5 }),
                    mouseout: (event) => {
                      const selected =
                        normalizeCode(getStateCode(feature)) === normalizeCode(selectedStateCode);
                      event.target.setStyle({
                        color: selected ? "#38bdf8" : (hasData ? tier.color : "#334155"),
                        weight: selected ? 3 : 1.2,
                        fillOpacity: selected ? 0.55 : (hasData ? 0.35 : 0.12),
                      });
                    },
                  });
                }}
              />
            )}

            {layersVisible.districts && districts && (
              <GeoJSON
                key={`districts-${selectedStateCode}-${selectedElectionYear || "latest"}-${targetParty}-${thresholds.tier1Max}-${thresholds.tier2Max}-${thresholds.tier3Max}-${tierFilter}`}
                data={districts}
                filter={(feature) => {
                  if (tierFilter && tierFilter !== "all") {
                    const shares = feature.properties?.party_shares || {};
                    const targetShare = shares[targetParty];
                    if (targetShare === undefined || targetShare === null) return false;
                    const tier = getVotePercentageTier(targetShare, thresholds);
                    if (tier.tier !== tierFilter) return false;
                  }
                  return true;
                }}
                style={(feature) => {
                  const selected =
                    normalizeCode(getDistrictCode(feature)) === normalizeCode(selectedDistrictCode);
                  const shares = feature.properties?.party_shares || {};
                  const targetShare = shares[targetParty];
                  const hasData = targetShare !== undefined && targetShare !== null;
                  const tier = getVotePercentageTier(targetShare, thresholds);
                  return {
                    color: selected ? "#38bdf8" : (hasData ? tier.color : "#475569"),
                    weight: selected ? 3.5 : 2,
                    fillColor: hasData ? tier.color : (selected ? "#1e293b" : "#0d1522"),
                    fillOpacity: selected ? 0.55 : (hasData ? 0.38 : 0.15),
                  };
                }}
                onEachFeature={(feature, layer) => {
                  const name = getDistrictName(feature) || "District";
                  const shares = feature.properties?.party_shares || {};
                  const targetShare = shares[targetParty];
                  const hasData = targetShare !== undefined && targetShare !== null;
                  const tier = getVotePercentageTier(targetShare, thresholds);

                  let tooltipHtml = `<strong>${name}</strong>`;
                  if (hasData) {
                    tooltipHtml += `<br/><span style="display:inline-block;width:8px;height:8px;background:${tier.color};border-radius:2px;margin-right:4px;"></span>${targetParty}: <b>${targetShare}%</b> (${tier.tier.toUpperCase()})`;
                  }
                  if (secondaryParty && secondaryParty !== "none") {
                    const p2Share = shares[secondaryParty];
                    if (p2Share !== undefined && p2Share !== null) {
                      const p2Tier = getVotePercentageTier(p2Share, thresholds);
                      tooltipHtml += `<br/><span style="display:inline-block;width:8px;height:8px;background:${p2Tier.color};border-radius:2px;margin-right:4px;"></span>${secondaryParty}: <b>${p2Share}%</b> (${p2Tier.tier.toUpperCase()})`;
                    }
                  }

                  layer.bindTooltip(tooltipHtml, { sticky: true });
                  layer.on({
                    click: () => handleDistrictClick(feature),
                    mouseover: (event) => event.target.setStyle({ weight: 3.5, fillOpacity: 0.65 }),
                    mouseout: (event) => {
                      const selected =
                        normalizeCode(getDistrictCode(feature)) === normalizeCode(selectedDistrictCode);
                      event.target.setStyle({
                        color: selected ? "#38bdf8" : (hasData ? tier.color : "#475569"),
                        weight: selected ? 3.5 : 2,
                        fillOpacity: selected ? 0.55 : (hasData ? 0.38 : 0.15),
                      });
                    },
                  });
                }}
              />
            )}

            {layersVisible.assemblies && selectedDistrictCode && assemblies && (
              <GeoJSON
                key={`assemblies-${selectedDistrictCode}-${selectedElectionYear || "latest"}-${targetParty}-${secondaryParty}-${thresholds.tier1Max}-${thresholds.tier2Max}-${thresholds.tier3Max}-${tierFilter}`}
                data={assemblies}
                filter={(feature) => {
                  const districtCode = getAssemblyDistrictCode(feature);
                  const hasDistrictCodes = assemblies.features.some((item) => {
                    const code = getAssemblyDistrictCode(item);
                    return code !== undefined && code !== null && code !== "";
                  });
                  const inDistrict =
                    Boolean(feature.geometry) &&
                    (!hasDistrictCodes || normalizeCode(districtCode) === normalizeCode(selectedDistrictCode));
                  if (!inDistrict) return false;

                  if (tierFilter && tierFilter !== "all") {
                    const shares = feature.properties?.party_shares || {};
                    const targetShare = shares[targetParty] ?? 0;
                    const tier = getVotePercentageTier(targetShare, thresholds);
                    if (tier.tier !== tierFilter) return false;
                  }
                  return true;
                }}
                style={(feature) => {
                  const acNo = getAssemblyNumber(feature);
                  const selected =
                    normalizeCode(acNo) === normalizeCode(selectedAssemblyNumber);

                  const shares = feature.properties?.party_shares || {};
                  const targetShare = shares[targetParty] ?? 0;
                  const tier = getVotePercentageTier(targetShare, thresholds);

                  return {
                    color: selected ? "#38bdf8" : tier.color,
                    weight: selected ? 3.5 : 2,
                    fillColor: tier.color,
                    fillOpacity: selected ? 0.55 : 0.32,
                    dashArray: selected ? "" : "none",
                  };
                }}
                onEachFeature={(feature, layer) => {
                  const name = getAssemblyName(feature);
                  const acNo = getAssemblyNumber(feature);
                  const shares = feature.properties?.party_shares || {};
                  const p1Share = shares[targetParty] ?? 0;
                  const p1Tier = getVotePercentageTier(p1Share, thresholds);

                  let tooltipHtml = `<strong>${name || "Assembly"}</strong>${acNo ? ` • AC ${acNo}` : ""}<br/>`;
                  tooltipHtml += `<span style="display:inline-block;width:8px;height:8px;background:${p1Tier.color};border-radius:2px;margin-right:4px;"></span>${targetParty}: <b>${p1Share}%</b> (${p1Tier.tier.toUpperCase()})`;

                  if (secondaryParty && secondaryParty !== "none") {
                    const p2Share = shares[secondaryParty] ?? 0;
                    const p2Tier = getVotePercentageTier(p2Share, thresholds);
                    tooltipHtml += `<br/><span style="display:inline-block;width:8px;height:8px;background:${p2Tier.color};border-radius:2px;margin-right:4px;"></span>${secondaryParty}: <b>${p2Share}%</b> (${p2Tier.tier.toUpperCase()})`;
                    tooltipHtml += `<br/><small style="color:#94a3b8;margin-top:2px;display:inline-block;">Pattern: <b style="color:#f8fafc">${p1Tier.tier}-${p2Tier.tier}</b></small>`;
                  }

                  // Permanent clean label like reference image
                  layer.bindTooltip(name || `AC ${acNo}`, {
                    permanent: true,
                    direction: "center",
                    className: "tactical-map-label",
                  });

                  layer.on({
                    click: () => handleAssemblyClick(feature),
                    mouseover: (event) => {
                      event.target.setStyle({ weight: 3.5, fillOpacity: 0.65 });
                    },
                    mouseout: (event) => {
                      const selected =
                        normalizeCode(acNo) === normalizeCode(selectedAssemblyNumber);
                      const tier = getVotePercentageTier(shares[targetParty] ?? 0, thresholds);
                      event.target.setStyle({
                        color: selected ? "#38bdf8" : tier.color,
                        weight: selected ? 3.5 : 2,
                        fillOpacity: selected ? 0.55 : 0.32,
                      });
                    },
                  });
                }}
              />
            )}

            {layersVisible.villageBoundary &&
              selectedAssemblyNumber &&
              villages?.features?.length > 0 && (
                <GeoJSON
                  key={`villages-boundary-${selectedAssemblyNumber}-${selectedElectionYear || "latest"}-${targetParty}-${thresholds.tier1Max}-${thresholds.tier2Max}-${thresholds.tier3Max}-${tierFilter}`}
                  data={villages}
                  filter={(feature) => {
                    if (!feature.geometry) return false;
                    if (tierFilter && tierFilter !== "all") {
                      const shares = feature.properties?.party_shares || {};
                      const targetShare = shares[targetParty];
                      if (targetShare === undefined || targetShare === null || !(feature.properties?.votes_polled > 0)) return false;
                      const tier = getVotePercentageTier(targetShare, thresholds);
                      if (tier.tier !== tierFilter) return false;
                    }
                    return true;
                  }}
                  style={(feature) => {
                    const vName = getVillageName(feature);
                    const isSelected =
                      selectedVillage &&
                      String(selectedVillage).trim().toLowerCase() === String(vName).trim().toLowerCase();
                    const shares = feature.properties?.party_shares || {};
                    const targetShare = shares[targetParty];
                    const hasData =
                      targetShare !== undefined && targetShare !== null && feature.properties?.votes_polled > 0;
                    const tier = getVotePercentageTier(targetShare, thresholds);
                    return {
                      color: isSelected ? "#38bdf8" : (hasData ? tier.color : "#475569"),
                      weight: isSelected ? 3.5 : (hasData ? 2 : 1),
                      fillColor: hasData ? tier.color : (isSelected ? "#1e293b" : "#1e293b"),
                      fillOpacity: isSelected ? 0.65 : (hasData ? 0.38 : 0.12),
                    };
                  }}
                  onEachFeature={(feature, layer) => {
                    const vName = getVillageName(feature) || "Village";
                    const shares = feature.properties?.party_shares || {};
                    const targetShare = shares[targetParty];
                    const hasData =
                      targetShare !== undefined && targetShare !== null && feature.properties?.votes_polled > 0;
                    const tier = getVotePercentageTier(targetShare, thresholds);
                    const polled = feature.properties?.votes_polled;

                    let tooltipHtml = `<strong>${vName}</strong>`;
                    if (polled) {
                      tooltipHtml += `<br/><small style="color:#94a3b8">Polled: ${polled.toLocaleString("en-IN")}</small>`;
                    }
                    if (hasData) {
                      tooltipHtml += `<br/><span style="display:inline-block;width:8px;height:8px;background:${tier.color};border-radius:2px;margin-right:4px;"></span>${targetParty}: <b>${targetShare}%</b> (${tier.tier.toUpperCase()})`;
                    } else {
                      tooltipHtml += `<br/><small style="color:#64748b">No booth mapping</small>`;
                    }
                    if (secondaryParty && secondaryParty !== "none" && hasData) {
                      const p2Share = shares[secondaryParty];
                      if (p2Share !== undefined && p2Share !== null) {
                        const p2Tier = getVotePercentageTier(p2Share, thresholds);
                        tooltipHtml += `<br/><span style="display:inline-block;width:8px;height:8px;background:${p2Tier.color};border-radius:2px;margin-right:4px;"></span>${secondaryParty}: <b>${p2Share}%</b> (${p2Tier.tier.toUpperCase()})`;
                      }
                    }

                    layer.bindTooltip(tooltipHtml, { sticky: true });
                    layer.on({
                      click: () => {
                        setSelectedVillage(String(vName));
                        setSelectedVillageFeature(feature);
                        setMapLevel("village");
                      },
                      mouseover: (event) => event.target.setStyle({ weight: 3.5, fillOpacity: 0.65 }),
                      mouseout: (event) => {
                        const isSelected =
                          selectedVillage &&
                          String(selectedVillage).trim().toLowerCase() === String(vName).trim().toLowerCase();
                        event.target.setStyle({
                          color: isSelected ? "#38bdf8" : (hasData ? tier.color : "#475569"),
                          weight: isSelected ? 3.5 : (hasData ? 2 : 1),
                          fillOpacity: isSelected ? 0.65 : (hasData ? 0.38 : 0.12),
                        });
                      },
                    });
                  }}
                />
              )}

            {layersVisible.villageHotspots &&
              selectedAssemblyNumber &&
              villages?.features?.length > 0 &&
              villages.features
                .filter((feature) => {
                  if (tierFilter && tierFilter !== "all") {
                    const shares = feature.properties?.party_shares || {};
                    const targetShare = shares[targetParty];
                    if (targetShare === undefined || targetShare === null || !(feature.properties?.votes_polled > 0)) return false;
                    const tier = getVotePercentageTier(targetShare, thresholds);
                    if (tier.tier !== tierFilter) return false;
                  }
                  return true;
                })
                .map((feature, index) => {
                  const villageName = getVillageName(feature) || `Village ${index + 1}`;
                  const position = getFeatureCenter(feature);
                  if (!position) return null;

                  const isSelected =
                    String(selectedVillage).trim().toLowerCase() === String(villageName).trim().toLowerCase();
                  const shares = feature.properties?.party_shares || {};
                  const targetShare = shares[targetParty];
                  const hasData =
                    targetShare !== undefined && targetShare !== null && feature.properties?.votes_polled > 0;
                  const tier = getVotePercentageTier(targetShare, thresholds);
                  const markerColor = isSelected ? "#38bdf8" : (hasData ? tier.color : "#64748b");

                  const markerIcon = L.divIcon({
                    className: "village-location-marker",
                    html: `
                      <div style="width:38px;height:46px;display:flex;align-items:flex-start;justify-content:center;position:relative;">
                        <div style="width:30px;height:30px;position:relative;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${markerColor};border:3px solid #fff;box-shadow:0 4px 10px rgba(15,23,42,.4);">
                          <span style="position:absolute;width:10px;height:10px;background:#fff;border-radius:50%;top:7px;left:7px;"></span>
                        </div>
                        <div style="position:absolute;width:10px;height:5px;background:rgba(0,0,0,.22);border-radius:50%;bottom:1px;"></div>
                      </div>
                    `,
                    iconSize: [38, 46],
                    iconAnchor: [19, 43],
                  });

                  return (
                    <Marker
                      key={`village-hotspot-${index}-${String(villageName)}-${selectedElectionYear || "latest"}-${tierFilter}`}
                      position={position}
                      zIndexOffset={isSelected ? 1000 : 500}
                      icon={markerIcon}
                      eventHandlers={{
                        click: () => {
                          setSelectedVillage(String(villageName));
                          setSelectedVillageFeature(feature);
                          setMapLevel("village");
                        },
                      }}
                    >
                      <Tooltip direction="top" offset={[0, -40]} opacity={1}>
                        <strong>{villageName}</strong>
                        {hasData && (
                          <div style={{ fontSize: "11px", marginTop: "2px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                width: "8px",
                                height: "8px",
                                backgroundColor: tier.color,
                                borderRadius: "2px",
                                marginRight: "4px",
                              }}
                            />
                            {targetParty}: <b>{targetShare}%</b> ({tier.tier.toUpperCase()})
                          </div>
                        )}
                      </Tooltip>
                    </Marker>
                  );
                })}

            <MapController
              selectedFeature={
                selectedVillageFeature ||
                selectedAssemblyFeature ||
                selectedDistrictFeature ||
                selectedStateFeature
              }
              level={mapLevel}
              dashboardOpen={dashboardOpen}
            />
          </MapContainer>

          {/* REFERENCE UI OVERLAY: Top District, Current View & Stats Bar */}
          <div className="reference-top-bar">
            <div className="reference-left-cluster">
              <MapLayerControl
                layersVisible={layersVisible}
                toggleLayer={toggleLayer}
                setAllLayers={setAllLayers}
              />
              <div className="reference-district-title">
                <span>{selectedDistrict ? selectedDistrict.toUpperCase() : selectedState ? selectedState.toUpperCase() : "UTTAR PRADESH"}</span>
                <span className="seats-badge">• {assemblyOptions.length || (assemblies?.features?.length ?? 6)} SEATS</span>
              </div>
              <div className="reference-view-tag">
                <span className="reference-view-dot" />
                <span>{currentLevel} View</span>
              </div>
              {tierFilter !== "all" && (
                <div
                  className={`reference-filter-tag ${tierFilter === "amber" ? "amber-filter" : ""}`}
                  onClick={() => setTierFilter("all")}
                  title="Click to clear filter"
                  role="button"
                  tabIndex={0}
                >
                  <span
                    className="tier-dot"
                    style={{
                      backgroundColor:
                        tierFilter === "amber"
                          ? thresholds.tier2Color
                          : tierFilter === "red"
                          ? thresholds.tier1Color
                          : tierFilter === "yellow"
                          ? thresholds.tier3Color
                          : thresholds.tier4Color,
                    }}
                  />
                  <span>FILTER: {tierFilter.toUpperCase()} ONLY</span>
                  <span className="filter-clear-cross">×</span>
                </div>
              )}
            </div>

            <div className="reference-right-cluster">
              <div className="reference-voters-stat">
                <span className="reference-voters-num">
                  {assemblyDashboard?.electors
                    ? (assemblyDashboard.electors / 100000).toFixed(1)
                    : assemblies?.features?.length
                    ? (assemblies.features.reduce((acc, f) => acc + (f.properties?.electors || 330000), 0) / 100000).toFixed(1)
                    : "20.3"}
                </span>
                <span className="reference-voters-label">lakh voters</span>
              </div>
            </div>
          </div>

          {tierFilter !== "all" && currentLevelFilterMatchCount === 0 && (
            <div className="filter-empty-banner">
              <span>⚠️ No <strong>{tierFilter.toUpperCase()}</strong> {currentLevel}s found for {targetParty}.</span>
              <button type="button" className="filter-clear-btn" onClick={() => setTierFilter("all")}>
                Clear Filter
              </button>
            </div>
          )}

          {(selectedDistrict && !assembliesHaveBoundaries) && (
            <div className="map-data-notice" style={{ position: "absolute", top: "68px", left: "20px", zIndex: 650 }}>
              Assembly records are available, but boundary geometry is empty. Choose an assembly from the sidebar to open its dashboard.
            </div>
          )}
          {(selectedAssembly && villageOptions.length > 0 && !villagesHaveGeometry) && (
            <div className="map-data-notice" style={{ position: "absolute", top: "68px", left: "20px", zIndex: 650 }}>
              Village records are available, but map geometry is empty.
            </div>
          )}

          {/* REFERENCE UI OVERLAY: Demarcation Legend */}
          <div className="demarcation-legend">
            <div className="demarcation-legend-title">
              <span>DEMARCATION TIERS</span>
              <span className="target-pill">{targetParty}</span>
              {secondaryParty && secondaryParty !== "none" && (
                <span className="target-pill" style={{ background: "rgba(245, 158, 11, 0.2)", color: "#f59e0b" }}>
                  vs {secondaryParty}
                </span>
              )}
            </div>
            <div className="demarcation-tiers">
              {(() => {
                const getScopeCount = (tierName) => {
                  if (currentLevel === "Village") return scopeTierCounts.villages[tierName] ?? 0;
                  if (currentLevel === "Assembly") return scopeTierCounts.assemblies[tierName] ?? 0;
                  if (currentLevel === "District") return scopeTierCounts.districts[tierName] ?? 0;
                  return null;
                };

                const redCount = getScopeCount("red");
                const amberCount = getScopeCount("amber");
                const yellowCount = getScopeCount("yellow");
                const greenCount = getScopeCount("green");

                return (
                  <>
                    <div
                      className={`demarcation-tier-chip clickable ${tierFilter === "red" ? "active-tier" : ""}`}
                      onClick={() => setTierFilter((prev) => (prev === "red" ? "all" : "red"))}
                      title={`Click to filter Tier 1 (Red: < ${thresholds.tier1Max}%)${redCount !== null ? ` — ${redCount} ${currentLevel}s` : ""}`}
                      role="button"
                      tabIndex={0}
                    >
                      <span className="tier-dot" style={{ backgroundColor: thresholds.tier1Color, color: thresholds.tier1Color }} />
                      <span>&lt; {thresholds.tier1Max}%</span>
                      {redCount !== null && <span className="tier-chip-count">{redCount}</span>}
                      {tierFilter === "red" && <span className="tier-check">✓</span>}
                    </div>
                    <div
                      className={`demarcation-tier-chip clickable ${tierFilter === "amber" ? "active-tier amber-active" : ""}`}
                      onClick={() => setTierFilter((prev) => (prev === "amber" ? "all" : "amber"))}
                      title={`Click to filter Tier 2 (Amber: ${thresholds.tier1Max}-${thresholds.tier2Max}%)${amberCount !== null ? ` — ${amberCount} ${currentLevel}s` : ""}`}
                      role="button"
                      tabIndex={0}
                    >
                      <span className="tier-dot" style={{ backgroundColor: thresholds.tier2Color, color: thresholds.tier2Color }} />
                      <span>{thresholds.tier1Max}-{thresholds.tier2Max}%</span>
                      {amberCount !== null && <span className="tier-chip-count">{amberCount}</span>}
                      {tierFilter === "amber" && <span className="tier-check">✓</span>}
                    </div>
                    <div
                      className={`demarcation-tier-chip clickable ${tierFilter === "yellow" ? "active-tier" : ""}`}
                      onClick={() => setTierFilter((prev) => (prev === "yellow" ? "all" : "yellow"))}
                      title={`Click to filter Tier 3 (Yellow: ${thresholds.tier2Max}-${thresholds.tier3Max}%)${yellowCount !== null ? ` — ${yellowCount} ${currentLevel}s` : ""}`}
                      role="button"
                      tabIndex={0}
                    >
                      <span className="tier-dot" style={{ backgroundColor: thresholds.tier3Color, color: thresholds.tier3Color }} />
                      <span>{thresholds.tier2Max}-{thresholds.tier3Max}%</span>
                      {yellowCount !== null && <span className="tier-chip-count">{yellowCount}</span>}
                      {tierFilter === "yellow" && <span className="tier-check">✓</span>}
                    </div>
                    <div
                      className={`demarcation-tier-chip clickable ${tierFilter === "green" ? "active-tier" : ""}`}
                      onClick={() => setTierFilter((prev) => (prev === "green" ? "all" : "green"))}
                      title={`Click to filter Tier 4 (Green: > ${thresholds.tier3Max}%)${greenCount !== null ? ` — ${greenCount} ${currentLevel}s` : ""}`}
                      role="button"
                      tabIndex={0}
                    >
                      <span className="tier-dot" style={{ backgroundColor: thresholds.tier4Color, color: thresholds.tier4Color }} />
                      <span>&gt; {thresholds.tier3Max}%</span>
                      {greenCount !== null && <span className="tier-chip-count">{greenCount}</span>}
                      {tierFilter === "green" && <span className="tier-check">✓</span>}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* REFERENCE UI OVERLAY: Bottom Winner Breakdown Bar */}
          <div className="reference-bottom-bar">
            <div className="reference-bottom-title">
              <span>{selectedElectionYear || "2022"} ASSEMBLY WINNERS</span>
              <span style={{ color: "#cbd5e1" }}>
                {assemblies?.features?.length ? `${assemblies.features.length} ACs Tracked` : "Summary"}
              </span>
            </div>

            {/* Segmented bar */}
            <div className="reference-segmented-bar">
              {(() => {
                const acFeatures = assemblies?.features || [];
                const counts = { RLD: 0, BJP: 0, SP: 0, BSP: 0, INC: 0, OTH: 0 };
                acFeatures.forEach((f) => {
                  const w = f.properties?.winner || "OTH";
                  if (counts[w] !== undefined) counts[w] += 1;
                  else counts.OTH += 1;
                });
                const total = acFeatures.length || 1;
                return [
                  { party: "RLD", count: counts.RLD, color: "#16a34a" },
                  { party: "BJP", count: counts.BJP, color: "#f97316" },
                  { party: "SP", count: counts.SP, color: "#ef4444" },
                  { party: "BSP", count: counts.BSP, color: "#2563eb" },
                  { party: "INC", count: counts.INC, color: "#0284c7" },
                ]
                  .filter((item) => item.count > 0)
                  .map((item) => (
                    <div
                      key={item.party}
                      className="reference-segment"
                      style={{
                        width: `${(item.count / total) * 100}%`,
                        backgroundColor: item.color,
                      }}
                      title={`${item.party}: ${item.count} seats`}
                    />
                  ));
              })()}
            </div>

            {/* Prominent Party Tally Cards */}
            <div className="reference-party-cards">
              {(() => {
                const acFeatures = assemblies?.features || [];
                const counts = { RLD: 0, BJP: 0, SP: 0 };
                acFeatures.forEach((f) => {
                  const w = f.properties?.winner;
                  if (w && counts[w] !== undefined) counts[w] += 1;
                });
                return [
                  { party: "RLD", count: counts.RLD, bg: "#16a34a" },
                  { party: "BJP", count: counts.BJP, bg: "#f97316" },
                  { party: "SP", count: counts.SP, bg: "#ef4444" },
                ].map((card) => (
                  <div
                    key={card.party}
                    className="reference-party-card"
                    style={{ backgroundColor: card.bg }}
                    onClick={() => {
                      if (card.party === "RLD") {
                        setTargetParty("RLD");
                      } else {
                        setSecondaryParty(card.party);
                      }
                    }}
                    title={card.party === "RLD" ? "Primary Target: RLD" : `Click to set comparison vs ${card.party}`}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="reference-party-count">{card.count}</div>
                    <div className="reference-party-name">{card.party}</div>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Settings Modal */}
          {settingsOpen && (
            <SettingsModal
              thresholds={thresholds}
              onSave={handleSaveThresholds}
              onClose={() => setSettingsOpen(false)}
            />
          )}

          {selectedState && !dashboardOpen && (
            <button
              type="button"
              className="dashboard-reopen-button"
              onClick={() => setDashboardOpen(true)}
            >
              <span>▤</span>
              Election Dashboard
            </button>
          )}

          {dashboardOpen && (
            <AssemblyDashboard
              data={assemblyDashboard}
              loading={dashboardLoading}
              error={dashboardError}
              title={dashboardTitle}
              subtitle={dashboardSubtitle}
              onClose={closeDashboard}
              onDownload={downloadReport}
              electionYears={electionYears}
              selectedElectionYear={selectedElectionYear}
              onElectionYearChange={setSelectedElectionYear}
              level={activeGeography.level}
              targetParty={targetParty}
              thresholds={thresholds}
              tierFilter={tierFilter}
              setTierFilter={setTierFilter}
              tierCounts={scopeTierCounts}
            />
          )}
          {callReportsOpen && selectedState && (
            <CallReportsPanel
              reports={callReports}
              loading={callReportsLoading}
              error={callReportsError}
              title={currentLocation}
              onClose={() => setCallReportsOpen(false)}
            />
          )}
          {comparisonRows.length > 0 && (
            <section className="comparison-panel">
              <header className="comparison-header"><div><small>AREA COMPARISON</small><strong>{comparisonRows.length} locations</strong></div><div className="comparison-actions"><button type="button" onClick={downloadReport}>↓ Download report</button><button type="button" className="comparison-clear" onClick={() => setComparisonRows([])}>Clear</button></div></header>
              <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>Metric</th>{comparisonRows.map((row) => <th key={row.label}>{row.label}</th>)}</tr></thead><tbody>
                {[["Level", (row) => row.level], ["Election", (row) => row.data?.election?.name || row.data?.election?.type || "—"], ["Year", (row) => row.data?.election?.year || "—"], ["Booths with results", (row) => formatNumber(row.data?.booths_with_results)], ["Electors", (row) => formatNumber(row.data?.electors)], ["Votes polled", (row) => formatNumber(row.data?.votes_polled)], ["Valid votes", (row) => formatNumber(row.data?.valid_votes)]].map(([label, value]) => <tr key={label}><th>{label}</th>{comparisonRows.map((row) => <td key={row.label}>{value(row)}</td>)}</tr>)}
                <tr className="comparison-section-row"><th colSpan={comparisonRows.length + 1}>PARTY VOTE COMPARISON</th></tr>
                {[...new Set(comparisonRows.flatMap((row) => (row.data?.party_votes || []).filter((party) => (party.votes || 0) > 0).map((party) => party.party)))].map((partyName) => <Fragment key={partyName}><tr><th>{partyName} · Votes</th>{comparisonRows.map((row) => { const party = row.data?.party_votes?.find((item) => item.party === partyName); return <td key={row.label}>{party ? formatNumber(party.votes) : "—"}</td>; })}</tr><tr><th>{partyName} · Vote share</th>{comparisonRows.map((row) => { const party = row.data?.party_votes?.find((item) => item.party === partyName); return <td key={row.label}>{party ? formatPercent(party.share_percent) : "—"}</td>; })}</tr></Fragment>)}
              </tbody></table></div>
              <footer className="comparison-footer"><span>{LAYER_CONFIG.filter((layer) => layersVisible[layer.key]).length} of 6 map layers visible</span><button type="button" onClick={downloadReport}>Export current report as CSV</button></footer>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

