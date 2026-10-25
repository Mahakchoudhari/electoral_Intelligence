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
// =========================================================

function AssemblyDashboard({ data, loading, error, title, subtitle, onClose, onDownload, electionYears, selectedElectionYear, onElectionYearChange }) {
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

        <section className="dashboard-section">
          <div className="dashboard-section-title">02 · PARTY VOTE TOTALS</div>
          <div className="party-card">
            <div className="party-card-header"><div className="party-name">Party</div><div className="party-column-labels"><span>Votes</span><span>Share</span></div></div>
            {(data.party_votes || []).map((party) => (
              <div className="band-row" key={party.party}>
                <div className="band-left"><span className="band-name">{party.party}</span></div>
                <div className="band-values"><strong>{formatNumber(party.votes)}</strong><span>{formatPercent(party.share_percent)}</span></div>
              </div>
            ))}
          </div>
        </section>

        <section className="dashboard-section">
          <div className="dashboard-section-title">03 · POLL TOTALS</div>
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

        <div className="dashboard-source">
          <span className="source-dot" />
          Results aggregated from election booths and booth results
        </div>
      </div>
    </div>
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

  const [selectedState, setSelectedState] = useState("");
  const [selectedStateCode, setSelectedStateCode] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedDistrictCode, setSelectedDistrictCode] = useState("");
  const [selectedAssembly, setSelectedAssembly] = useState("");
  const [selectedAssemblyNumber, setSelectedAssemblyNumber] = useState("");
  const [selectedVillage, setSelectedVillage] = useState("");
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
  const [comparisonRows, setComparisonRows] = useState([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [electionYears, setElectionYears] = useState([]);
  const [selectedElectionYear, setSelectedElectionYear] = useState("");
  const [electionYearsLoading, setElectionYearsLoading] = useState(false);
  const [electionScopeKey, setElectionScopeKey] = useState("");

  const currentScope = useMemo(() => ({
    state: selectedState || null,
    districtCode: selectedDistrictCode || null,
    acNo: selectedAssemblyNumber || null,
    villageId: selectedVillageFeature?.properties?.village_id ? Number(selectedVillageFeature.properties.village_id) : null,
    level: selectedVillage ? "village" : selectedAssemblyNumber ? "ac" : selectedDistrictCode ? "district" : "state",
  }), [selectedState, selectedDistrictCode, selectedAssemblyNumber, selectedVillage, selectedVillageFeature]);
  const currentScopeKey = JSON.stringify(currentScope);

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
      "query ($state: String, $districtCode: String, $acNo: String, $villageId: Int, $level: String!) { electionYears(state: $state, districtCode: $districtCode, acNo: $acNo, villageId: $villageId, level: $level) }",
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
        const data = await graphqlRequest("query { states }");
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
  }, []);

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
    graphqlRequest("query ($state: String!) { districts(state: $state) }", { state: selectedState })
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
  }, [selectedState]);

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
      "query ($districtCode: String!) { assemblies(districtCode: $districtCode) }",
      { districtCode: String(selectedDistrictCode) }
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
  }, [selectedDistrictCode]);

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
          "query ($state: String, $districtCode: String, $acNo: String, $villageId: Int, $level: String!, $electionYear: Int) { pollResults(state: $state, districtCode: $districtCode, acNo: $acNo, villageId: $villageId, level: $level, electionYear: $electionYear) }",
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
      setSelectedVillage("");
      setSelectedVillageFeature(null);
      return;
    }

    let cancelled = false;

    async function loadVillages() {
      setVillageLoading(true);
      try {
        const result = await graphqlRequest(
          "query ($acNo: String!) { villages(acNo: $acNo) }",
          { acNo: String(selectedAssemblyNumber) }
        );
        const data = result.villages;
        if (!cancelled) setVillages(data);
      } catch (error) {
        if (!cancelled) {
          console.error("Village hotspot loading error:", error);
          setVillages(null);
        }
      } finally {
        if (!cancelled) setVillageLoading(false);
      }
    }

    loadVillages();
    return () => { cancelled = true; };
  }, [selectedAssemblyNumber]);

  const stateOptions = useMemo(() => {
    if (!states?.features) return [];
    return [...new Set(states.features.map(getStateName).filter(Boolean))].sort();
  }, [states]);

  const districtOptions = useMemo(() => {
    if (!districts?.features) return [];
    return [...new Set(districts.features.map(getDistrictName).filter(Boolean))].sort();
  }, [districts]);

  const assemblyOptions = useMemo(() => {
    if (!assemblies?.features || !selectedDistrictCode) return [];
    return [...new Set(assemblies.features.map(getAssemblyName).filter(Boolean))].sort();
  }, [assemblies, selectedDistrictCode]);

  const villageOptions = useMemo(() => {
    if (!villages?.features) return [];
    const names = villages.features
      .map(getVillageName)
      .map((name) => String(name || "").trim())
      .filter(Boolean);
    return [...new Set(names)].sort((a, b) =>
      a.localeCompare(b, "en", { sensitivity: "base" })
    );
  }, [villages]);

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
    villageId: selectedVillageFeature?.properties?.village_id ? Number(selectedVillageFeature.properties.village_id) : null,
    electionYear: selectedElectionYear ? Number(selectedElectionYear) : null,
  };

  async function addCurrentToComparison() {
    if (!selectedState || comparisonLoading) return;
    const comparisonLabel = `${activeGeography.label} · ${selectedElectionYear || "Latest"}`;
    if (comparisonRows.some((row) => row.label === comparisonLabel)) return;
    setComparisonLoading(true);
    try {
      const data = await graphqlRequest(
        "query ($state: String, $districtCode: String, $acNo: String, $villageId: Int, $level: String!, $electionYear: Int) { pollResults(state: $state, districtCode: $districtCode, acNo: $acNo, villageId: $villageId, level: $level, electionYear: $electionYear) }",
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
    const lines = [["Location", "Level", "Election", "Year", "Booths with results", "Booth records", "Electors", "Votes polled", "Valid votes", "Party", "Party votes", "Party share", "Visible layers"]];
    const visibleLayers = LAYER_CONFIG.filter((layer) => layersVisible[layer.key]).map((layer) => layer.title).join("; ");
    rows.forEach((row) => {
      const data = row.data || {};
      const parties = data.party_votes?.length ? data.party_votes : [null];
      parties.forEach((party) => lines.push([
        row.location || row.label, row.level, data.election?.name || data.election?.type || "", data.election?.year || row.electionYear || "",
        data.booths_with_results ?? "", data.booth_records ?? "", data.electors ?? "", data.votes_polled ?? "",
        data.valid_votes ?? "", party?.party || "", party?.votes ?? "", party?.share_percent ?? "", visibleLayers,
      ]));
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

  const currentLevel = selectedVillage
    ? "Village"
    : selectedAssembly
    ? "Assembly"
    : selectedDistrict
    ? "District"
    : selectedState
    ? "State"
    : "India";

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
          <div className="system-status">
            <span className="status-dot" />
            GIS SYSTEM
          </div>
          <button className="reset-button" onClick={resetMap}>
            <span>↻</span> Reset
          </button>
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
                      : villageOptions.length
                      ? "Select village"
                      : "No villages found"
                    : "Select assembly first"
                }
                disabled={!selectedAssembly || villageLoading || villageOptions.length === 0}
                onChange={handleVillageChange}
              />
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
                key="india-states"
                data={states}
                style={(feature) => {
                  const selected =
                    normalizeCode(getStateCode(feature)) === normalizeCode(selectedStateCode);
                  return {
                    color: selected ? "#0f172a" : "#475569",
                    weight: selected ? 3 : 1.4,
                    fillColor: selected ? "#3b82f6" : "#94a3b8",
                    fillOpacity: selected ? 0.2 : 0.04,
                  };
                }}
                onEachFeature={(feature, layer) => {
                  layer.bindTooltip(getStateName(feature) || "State", { sticky: true });
                  layer.on({
                    click: () => handleStateClick(feature),
                    mouseover: (event) => event.target.setStyle({ weight: 3, fillOpacity: 0.2 }),
                    mouseout: (event) => {
                      const selected =
                        normalizeCode(getStateCode(feature)) === normalizeCode(selectedStateCode);
                      event.target.setStyle({
                        weight: selected ? 3 : 1.4,
                        fillOpacity: selected ? 0.2 : 0.04,
                      });
                    },
                  });
                }}
              />
            )}

            {layersVisible.districts && districts && (
              <GeoJSON
                key={`districts-${selectedStateCode}`}
                data={districts}
                style={(feature) => {
                  const selected =
                    normalizeCode(getDistrictCode(feature)) === normalizeCode(selectedDistrictCode);
                  return {
                    color: selected ? "#111827" : "#2563eb",
                    weight: selected ? 3 : 1.4,
                    fillColor: "#60a5fa",
                    fillOpacity: selected ? 0.28 : 0.05,
                  };
                }}
                onEachFeature={(feature, layer) => {
                  layer.bindTooltip(getDistrictName(feature) || "District", { sticky: true });
                  layer.on({
                    click: () => handleDistrictClick(feature),
                    mouseover: (event) => event.target.setStyle({ weight: 3, fillOpacity: 0.22 }),
                    mouseout: (event) => {
                      const selected =
                        normalizeCode(getDistrictCode(feature)) === normalizeCode(selectedDistrictCode);
                      event.target.setStyle({
                        weight: selected ? 3 : 1.4,
                        fillOpacity: selected ? 0.28 : 0.05,
                      });
                    },
                  });
                }}
              />
            )}

            {layersVisible.assemblies && selectedDistrictCode && assemblies && (
              <GeoJSON
                key={`assemblies-${selectedDistrictCode}`}
                data={assemblies}
                filter={(feature) => {
                  const districtCode = getAssemblyDistrictCode(feature);
                  const hasDistrictCodes = assemblies.features.some((item) => {
                    const code = getAssemblyDistrictCode(item);
                    return code !== undefined && code !== null && code !== "";
                  });
                  return (
                    Boolean(feature.geometry) &&
                    (!hasDistrictCodes || normalizeCode(districtCode) === normalizeCode(selectedDistrictCode))
                  );
                }}
                style={(feature) => {
                  const acNo = getAssemblyNumber(feature);
                  const selected =
                    normalizeCode(acNo) === normalizeCode(selectedAssemblyNumber);
                  const color = getAssemblyColor(acNo);
                  return {
                    color: selected ? "#111827" : color,
                    weight: selected ? 3 : 1.4,
                    fillColor: color,
                    fillOpacity: selected ? 0.22 : 0.2,
                  };
                }}
                onEachFeature={(feature, layer) => {
                  const name = getAssemblyName(feature);
                  const acNo = getAssemblyNumber(feature);
                  layer.bindTooltip(`${name || "Assembly"}${acNo ? ` • AC ${acNo}` : ""}`, { sticky: true });
                  layer.on({
                    click: () => handleAssemblyClick(feature),
                    mouseover: (event) => event.target.setStyle({ weight: 3, fillOpacity: 0.45 }),
                    mouseout: (event) => {
                      const selected =
                        normalizeCode(acNo) === normalizeCode(selectedAssemblyNumber);
                      const color = getAssemblyColor(acNo);
                      event.target.setStyle({
                        color: selected ? "#111827" : color,
                        weight: selected ? 3 : 1.4,
                        fillOpacity: selected ? 0.22 : 0.2,
                      });
                    },
                  });
                }}
              />
            )}

            {layersVisible.villageBoundary &&
              selectedVillageFeature &&
              ["Polygon", "MultiPolygon"].includes(selectedVillageFeature.geometry?.type) && (
                <GeoJSON
                  key={`selected-village-${selectedVillage}-${selectedVillageFeature.properties?.objectid || "feature"}`}
                  data={selectedVillageFeature}
                  style={{
                    color: "#2563eb",
                    weight: 3,
                    fillColor: "#60a5fa",
                    fillOpacity: 0.18,
                  }}
                />
              )}

            {layersVisible.villageHotspots &&
              selectedAssemblyNumber &&
              villages?.features?.length > 0 &&
              villages.features.map((feature, index) => {
                const villageName = getVillageName(feature) || `Village ${index + 1}`;
                const position = getFeatureCenter(feature);
                if (!position) return null;

                const isSelected =
                  String(selectedVillage).trim().toLowerCase() === String(villageName).trim().toLowerCase();

                const markerIcon = L.divIcon({
                  className: "village-location-marker",
                  html: `
                    <div style="width:38px;height:46px;display:flex;align-items:flex-start;justify-content:center;position:relative;">
                      <div style="width:30px;height:30px;position:relative;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${isSelected ? "#2563eb" : "#dc2626"};border:3px solid #fff;box-shadow:0 4px 10px rgba(15,23,42,.4);">
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
                    key={`village-hotspot-${index}-${String(villageName)}`}
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

          <MapLayerControl
            layersVisible={layersVisible}
            toggleLayer={toggleLayer}
            setAllLayers={setAllLayers}
          />

          <div className="map-topbar">
            <div className="map-location">
              <span className="map-pin">◉</span>
              <div>
                <small>CURRENT VIEW</small>
                <strong>{currentLevel}</strong>
              </div>
            </div>

            <div className="map-breadcrumb">
              India
              {selectedState && ` / ${selectedState}`}
              {selectedDistrict && ` / ${selectedDistrict}`}
              {selectedAssembly && ` / ${selectedAssembly}`}
              {selectedVillage && ` / ${selectedVillage}`}
            </div>

            {selectedDistrict && !assembliesHaveBoundaries && (
              <div className="map-data-notice">
                Assembly records are available, but boundary geometry is empty. Choose an assembly from the sidebar to open its dashboard.
              </div>
            )}
            {selectedAssembly && villageOptions.length > 0 && !villagesHaveGeometry && (
              <div className="map-data-notice">
                Village records are available, but map geometry is empty.
              </div>
            )}
          </div>

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
            />
          )}
          {comparisonRows.length > 0 && (
            <section className="comparison-panel">
              <header className="comparison-header"><div><small>AREA COMPARISON</small><strong>{comparisonRows.length} locations</strong></div><div className="comparison-actions"><button type="button" onClick={downloadReport}>↓ Download report</button><button type="button" className="comparison-clear" onClick={() => setComparisonRows([])}>Clear</button></div></header>
              <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>Metric</th>{comparisonRows.map((row) => <th key={row.label}>{row.label}</th>)}</tr></thead><tbody>
                {[["Level", (row) => row.level], ["Election", (row) => row.data?.election?.name || row.data?.election?.type || "—"], ["Year", (row) => row.data?.election?.year || "—"], ["Booths with results", (row) => formatNumber(row.data?.booths_with_results)], ["Electors", (row) => formatNumber(row.data?.electors)], ["Votes polled", (row) => formatNumber(row.data?.votes_polled)], ["Valid votes", (row) => formatNumber(row.data?.valid_votes)]].map(([label, value]) => <tr key={label}><th>{label}</th>{comparisonRows.map((row) => <td key={row.label}>{value(row)}</td>)}</tr>)}
                <tr className="comparison-section-row"><th colSpan={comparisonRows.length + 1}>PARTY VOTE COMPARISON</th></tr>
                {[...new Set(comparisonRows.flatMap((row) => (row.data?.party_votes || []).map((party) => party.party)))].map((partyName) => <Fragment key={partyName}><tr><th>{partyName} · Votes</th>{comparisonRows.map((row) => { const party = row.data?.party_votes?.find((item) => item.party === partyName); return <td key={row.label}>{party ? formatNumber(party.votes) : "—"}</td>; })}</tr><tr><th>{partyName} · Vote share</th>{comparisonRows.map((row) => { const party = row.data?.party_votes?.find((item) => item.party === partyName); return <td key={row.label}>{party ? formatPercent(party.share_percent) : "—"}</td>; })}</tr></Fragment>)}
              </tbody></table></div>
              <footer className="comparison-footer"><span>{LAYER_CONFIG.filter((layer) => layersVisible[layer.key]).length} of 6 map layers visible</span><button type="button" onClick={downloadReport}>Export current report as CSV</button></footer>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
