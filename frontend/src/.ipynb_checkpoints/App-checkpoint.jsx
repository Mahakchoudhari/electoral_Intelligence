
import { useEffect, useMemo, useState } from "react";
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

const API = "http://127.0.0.1:8000/api/gis";

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
  return str ? str.replace(/^0+/, "") || "0" : "";
}

const STATE_FIELDS = ["STNAME", "ST_NAME", "state_name", "State_Name", "STATE"];
const STATE_CODE_FIELDS = ["STCODE11", "ST_CODE", "State_LGD", "state_code"];
const DISTRICT_FIELDS = ["dtname", "DTNAME", "DIST_NAME", "dtname11", "district", "district_name"];
const DISTRICT_CODE_FIELDS = ["dtcode11", "DT_CODE", "Dist_LGD", "dist_lgd", "district_code"];
const ASSEMBLY_FIELDS = ["AC_NAME", "ac_name", "assembly", "assembly_name"];
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
// MAP AUTO ZOOM
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

// =========================================================
// MAP LAYER CONTROL
// Placed on the LEFT side of the map
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
// PARTY BAND ROW
// =========================================================

function BandRow({ band, booths, percent }) {
  return (
    <div className="band-row">
      <div className="band-left">
        <span className={`band-dot band-${band.toLowerCase()}`} />
        <span className="band-name">{band}</span>
      </div>
      <div className="band-values">
        <strong>{formatNumber(booths)}</strong>
        <span>{formatPercent(percent)}</span>
      </div>
    </div>
  );
}

// =========================================================
// ASSEMBLY DASHBOARD
// =========================================================

function AssemblyDashboard({ data, loading, error, onClose }) {
  if (!data && loading) {
    return (
      <div className="assembly-dashboard">
        <div className="dashboard-header">
          <div>
            <div className="dashboard-eyebrow">ASSEMBLY DASHBOARD</div>
            <h2>Loading...</h2>
          </div>
          <button className="dashboard-close" onClick={onClose} aria-label="Close dashboard">×</button>
        </div>
        <div className="dashboard-loading">
          <div className="dashboard-loader" />
          <p>Loading assembly data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="assembly-dashboard">
        <div className="dashboard-header">
          <div>
            <div className="dashboard-eyebrow">ASSEMBLY DASHBOARD</div>
            <h2>Data unavailable</h2>
          </div>
          <button className="dashboard-close" onClick={onClose} aria-label="Close dashboard">×</button>
        </div>
        <div className="dashboard-error">
          <strong>Unable to load assembly data</strong>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const overview = data.overview || {};
  const bands = data.party_band_summary || {};
  const checks = data.data_checks || {};
  const bjp = bands.BJP || {};
  const rld = bands.RLD || {};

  return (
    <div className="assembly-dashboard">
      <div className="dashboard-header">
        <div>
          <div className="dashboard-eyebrow">ASSEMBLY DASHBOARD</div>
          <h2>{overview.ac_name || "Assembly"}</h2>
          <div className="dashboard-subtitle">
            AC {overview.ac_no ?? "—"}
            {overview.district_name && ` • ${overview.district_name}`}
          </div>
        </div>
        <button className="dashboard-close" onClick={onClose} aria-label="Close dashboard">×</button>
      </div>

      <div className="dashboard-scroll">
        <section className="dashboard-section">
          <div className="dashboard-section-title">01 · ASSEMBLY OVERVIEW</div>
          <div className="overview-grid">
            <div className="overview-card">
              <span>AC No.</span>
              <strong>{overview.ac_no ?? "—"}</strong>
            </div>
            <div className="overview-card">
              <span>Assembly Name</span>
              <strong>{overview.ac_name || "—"}</strong>
            </div>
            <div className="overview-card">
              <span>District Name</span>
              <strong>{overview.district_name || "—"}</strong>
            </div>
          </div>
        </section>

        <section className="dashboard-section">
          <div className="dashboard-section-title">02 · PARTY BAND SUMMARY</div>
          {[
            { name: "BJP", data: bjp },
            { name: "RLD", data: rld },
          ].map((party) => (
            <div className="party-card" key={party.name}>
              <div className="party-card-header">
                <div className="party-name">{party.name}</div>
                <div className="party-column-labels">
                  <span>Booths</span>
                  <span>Share</span>
                </div>
              </div>
              {["Red", "Amber", "Yellow", "Green"].map((band) => (
                <BandRow
                  key={band}
                  band={band}
                  booths={party.data[band]?.booths}
                  percent={party.data[band]?.percent}
                />
              ))}
            </div>
          ))}
        </section>

        <section className="dashboard-section">
          <div className="dashboard-section-title">03 · DATA CHECKS</div>
          <div className="checks-grid">
            {[
              ["Booth Records", formatNumber(checks.booth_records)],
              ["Total Votes", formatNumber(checks.total_votes)],
              ["BJP Votes", formatNumber(checks.bjp_votes)],
              ["BJP Vote Share", formatPercent(checks.bjp_vote_share)],
              ["RLD Votes", formatNumber(checks.rld_votes)],
              ["RLD Vote Share", formatPercent(checks.rld_vote_share)],
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
          Assembly-level aggregate data
        </div>
      </div>
    </div>
  );
}

// =========================================================
// MAIN APP
// =========================================================

export default function App() {
  const [states, setStates] = useState(null);
  const [districts, setDistricts] = useState(null);
  const [assemblies, setAssemblies] = useState(null);
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

  // Load states
  useEffect(() => {
    let cancelled = false;

    async function loadStates() {
      try {
        const response = await fetch(`${API}/states`);
        if (!response.ok) throw new Error("Failed to load states");
        const data = await response.json();
        if (!cancelled) setStates(data);
      } catch (error) {
        console.error("State loading error:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadStates();
    return () => { cancelled = true; };
  }, []);

  // Load UP districts and assemblies
  useEffect(() => {
    let cancelled = false;

    async function loadUPData() {
      try {
        const [districtResponse, assemblyResponse] = await Promise.all([
          fetch(`${API}/districts/uttar-pradesh`),
          fetch(`${API}/assemblies/uttar-pradesh`),
        ]);

        if (!districtResponse.ok || !assemblyResponse.ok) {
          throw new Error("Failed to load UP GIS data");
        }

        const [districtData, assemblyData] = await Promise.all([
          districtResponse.json(),
          assemblyResponse.json(),
        ]);

        if (cancelled) return;
        setDistricts(districtData);
        setAssemblies(assemblyData);
      } catch (error) {
        console.error("UP GIS loading error:", error);
      }
    }

    loadUPData();
    return () => { cancelled = true; };
  }, []);

  // Load assembly dashboard
  useEffect(() => {
    if (!selectedAssemblyNumber) {
      setAssemblyDashboard(null);
      setDashboardOpen(false);
      setDashboardError("");
      return;
    }

    let cancelled = false;

    async function loadAssemblyDashboard() {
      setDashboardLoading(true);
      setDashboardError("");

      try {
        const response = await fetch(
          `${API}/assembly-dashboard/${encodeURIComponent(selectedAssemblyNumber)}`
        );

        if (!response.ok) {
          let message = "Failed to load assembly dashboard";
          try {
            const body = await response.json();
            if (body?.detail) message = body.detail;
          } catch {
            // Response may not be JSON.
          }
          throw new Error(message);
        }

        const data = await response.json();
        if (cancelled) return;

        setAssemblyDashboard(data);
        setDashboardOpen(true);
      } catch (error) {
        if (cancelled) return;
        console.error("Assembly dashboard error:", error);
        setAssemblyDashboard(null);
        setDashboardError(error.message || "Unable to load assembly dashboard");
        setDashboardOpen(true);
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    }

    loadAssemblyDashboard();
    return () => { cancelled = true; };
  }, [selectedAssemblyNumber]);

  // Load village hotspots
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
        const response = await fetch(
          `${API}/villages/assembly/${encodeURIComponent(selectedAssemblyNumber)}`
        );
        if (!response.ok) throw new Error("Failed to load village hotspots");
        const data = await response.json();
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

  const isUttarPradesh = selectedState.trim().toLowerCase() === "uttar pradesh";

  const stateOptions = useMemo(() => {
    if (!states?.features) return [];
    return [...new Set(states.features.map(getStateName).filter(Boolean))].sort();
  }, [states]);

  const districtOptions = useMemo(() => {
    if (!isUttarPradesh || !districts?.features) return [];
    return [...new Set(districts.features.map(getDistrictName).filter(Boolean))].sort();
  }, [districts, isUttarPradesh]);

  const assemblyOptions = useMemo(() => {
    if (!isUttarPradesh || !assemblies?.features || !selectedDistrictCode) return [];
    const filtered = assemblies.features.filter(
      (feature) =>
        normalizeCode(getAssemblyDistrictCode(feature)) === normalizeCode(selectedDistrictCode)
    );
    return [...new Set(filtered.map(getAssemblyName).filter(Boolean))].sort();
  }, [assemblies, selectedDistrictCode, isUttarPradesh]);

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
    if (!isUttarPradesh) return;

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
    if (!isUttarPradesh || !selectedDistrictCode) return;

    const feature = assemblies?.features?.find(
      (item) =>
        normalizeCode(getAssemblyDistrictCode(item)) === normalizeCode(selectedDistrictCode) &&
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
    if (!isUttarPradesh) return;
    const name = getDistrictName(feature);
    if (name) handleDistrictChange(name);
  }

  function handleAssemblyClick(feature) {
    if (!isUttarPradesh) return;
    const name = getAssemblyName(feature);
    if (name) handleAssemblyChange(name);
  }

  // Closing hides only the dashboard. It does not reset the selection.
  function closeDashboard() {
    setDashboardOpen(false);
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
                placeholder="Select state"
                onChange={handleStateChange}
              />
              <SearchSelect
                label="District"
                value={selectedDistrict}
                options={isUttarPradesh ? districtOptions : []}
                placeholder={isUttarPradesh ? "Select district" : "Select Uttar Pradesh first"}
                disabled={!isUttarPradesh}
                onChange={handleDistrictChange}
              />
              <SearchSelect
                label="Assembly Constituency"
                value={selectedAssembly}
                options={assemblyOptions}
                placeholder={selectedDistrict ? "Select assembly" : "Select district first"}
                disabled={!selectedDistrict || !isUttarPradesh}
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
                    <strong>{isUttarPradesh && selectedState ? districts?.features?.length || 0 : "—"}</strong>
                    <small>Districts</small>
                  </div>
                </div>
                <div className="stat-card">
                  <span className="stat-icon">◈</span>
                  <div>
                    <strong>{isUttarPradesh && selectedDistrict ? assemblyOptions.length : "—"}</strong>
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
                <p>Click a boundary to drill down into the next electoral level.</p>
              </div>
            </div>
          </div>
        </aside>

        <main className="map-container">
          <MapContainer
            center={[22.5, 79.0]}
            zoom={5}
            minZoom={4}
            maxZoom={18}
            scrollWheelZoom
            zoomControl
            className="map"
          >
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

            {layersVisible.districts && isUttarPradesh && districts && (
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

            {layersVisible.assemblies &&
              isUttarPradesh &&
              selectedDistrictCode &&
              assemblies && (
                <GeoJSON
                  key={`assemblies-${selectedDistrictCode}`}
                  data={assemblies}
                  filter={(feature) =>
                    normalizeCode(getAssemblyDistrictCode(feature)) === normalizeCode(selectedDistrictCode)
                  }
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

          {/* LAYERS ON LEFT SIDE OF MAP */}
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
          </div>

          {/* Reopen button appears after dashboard is closed */}
          {selectedAssemblyNumber && !dashboardOpen && (
            <button
              type="button"
              className="dashboard-reopen-button"
              onClick={() => setDashboardOpen(true)}
            >
              <span>▤</span>
              Assembly Dashboard
            </button>
          )}

          {/* Dashboard closes independently; selection remains active */}
          {dashboardOpen && (
            <AssemblyDashboard
              data={assemblyDashboard}
              loading={dashboardLoading}
              error={dashboardError}
              onClose={closeDashboard}
            />
          )}
        </main>
      </div>
    </div>
  );
}
