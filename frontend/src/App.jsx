import { useEffect, useMemo, useState } from "react";

import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Tooltip,
  useMap,
} from "react-leaflet";

import L from "leaflet";

import "leaflet/dist/leaflet.css";
import "./index.css";


// =========================================================
// API
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
    throw new Error(payload.errors?.map((error) => error.message).join("; ") || "GraphQL request failed");
  }
  return payload.data;
}


// =========================================================
// PROPERTY HELPER
// =========================================================

function getProperty(properties, names) {
  if (!properties) return "";

  const keys = Object.keys(properties);

  for (const name of names) {
    const key = keys.find(
      (k) => k.toLowerCase() === name.toLowerCase()
    );

    if (key !== undefined) {
      return properties[key];
    }
  }

  return "";
}


// =========================================================
// CODE NORMALIZER
// =========================================================

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
// STATE
// =========================================================

function getStateName(feature) {
  return getProperty(feature?.properties, [
    "STNAME",
    "ST_NAME",
  ]);
}


function getStateCode(feature) {
  return getProperty(feature?.properties, [
    "STCODE11",
    "ST_CODE",
    "State_LGD",
  ]);
}


// =========================================================
// DISTRICT
// =========================================================

function getDistrictName(feature) {
  return getProperty(feature?.properties, [
    "dtname",
    "DTNAME",
    "DIST_NAME",
    "dtname11",
  ]);
}


function getDistrictCode(feature) {
  return getProperty(feature?.properties, [
    "dtcode11",
    "DT_CODE",
    "Dist_LGD",
    "dist_lgd",
  ]);
}


// =========================================================
// ASSEMBLY
// =========================================================

function getAssemblyName(feature) {
  return getProperty(feature?.properties, [
    "AC_NAME",
    "ac_name",
  ]);
}


function getAssemblyNumber(feature) {
  return getProperty(feature?.properties, [
    "AC_NO",
    "ac_no",
  ]);
}


function getAssemblyDistrictCode(feature) {
  return getProperty(feature?.properties, [
    "dtcode11",
    "DT_CODE",
  ]);
}


// =========================================================
// VILLAGE
// =========================================================

function getVillageName(feature) {
  return getProperty(feature?.properties, [
    "vilname11",
    "vilnam_soi",
    "search_village",
    "VILNAME11",
    "VIL_NAME",
    "village_name",
  ]);
}


function getVillageDistrictCode(feature) {
  return getProperty(feature?.properties, [
    "dtcode11",
    "DT_CODE",
    "dist_lgd",
    "Dist_LGD",
  ]);
}


function getVillageAssemblyNumber(feature) {
  return getProperty(feature?.properties, [
    "ac_no",
    "AC_NO",
    "acno",
    "ACNO",
  ]);
}


// =========================================================
// SEARCHABLE DROPDOWN
// =========================================================

function SearchSelect({
  label,
  value,
  options,
  placeholder,
  onChange,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredOptions = useMemo(() => {
    if (!search.trim()) {
      return options;
    }

    return options.filter((option) =>
      String(option)
        .toLowerCase()
        .includes(search.toLowerCase())
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

      <label>{label}</label>

      <div
        className={`custom-select ${
          disabled ? "disabled" : ""
        }`}
        onClick={() => {
          if (!disabled) {
            setOpen((prev) => !prev);
          }
        }}
      >
        <div className="selected-value">
          {value || placeholder}
        </div>

        <span className="arrow">
          {open ? "▲" : "▼"}
        </span>
      </div>


      {open && !disabled && (
        <div
          className="select-dropdown"
          onClick={(e) => e.stopPropagation()}
        >

          <input
            autoFocus
            className="select-search"
            placeholder={`Search ${label.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="options-list">

            {filteredOptions.length === 0 ? (

              <div className="no-option">
                No results found
              </div>

            ) : (

              filteredOptions.map((option) => (

                <div
                  key={String(option)}
                  className={`option ${
                    option === value
                      ? "active-option"
                      : ""
                  }`}
                  onClick={() => {

                    onChange(option);

                    setSearch("");

                    setOpen(false);
                  }}
                >
                  {option}
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
// AUTO ZOOM CONTROLLER
// =========================================================

function MapController({
  selectedFeature,
  level,
}) {
  const map = useMap();

  useEffect(() => {

    if (!selectedFeature) {
      return;
    }

    try {

      const layer = L.geoJSON(selectedFeature);

      const bounds = layer.getBounds();

      if (bounds.isValid()) {

        let maxZoom = 7;

        if (level === "state") {
          maxZoom = 7;
        }

        if (level === "district") {
          maxZoom = 10;
        }

        if (level === "assembly") {
          maxZoom = 13;
        }

        if (level === "village") {
          maxZoom = 17;
        }

        map.flyToBounds(
          bounds,
          {
            padding: [50, 50],
            duration: 1.2,
            maxZoom,
          }
        );
      }

    } catch (error) {

      console.error(
        "Zoom error:",
        error
      );

    }

  }, [
    selectedFeature,
    level,
    map,
  ]);

  return null;
}

<<<<<<< HEAD
=======
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

function AssemblyDashboard({ data, loading, error, title, subtitle, onClose }) {
  if (!data && loading) {
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
        </div>
        <button className="dashboard-close" onClick={onClose} aria-label="Close dashboard">×</button>
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
>>>>>>> e967c63 (refactor : add hierarchical GIS APIs and election result dashboards)

// =========================================================
// MAIN APP
// =========================================================

export default function App() {

  // =======================================================
  // GEOJSON DATA
  // =======================================================

  const [states, setStates] = useState(null);

  const [districts, setDistricts] = useState(null);
<<<<<<< HEAD

  const [assemblies, setAssemblies] = useState(null);

=======
  const [districtsLoading, setDistrictsLoading] = useState(true);
  const [districtsError, setDistrictsError] = useState("");
  const [assemblies, setAssemblies] = useState(null);
  const [assembliesLoading, setAssembliesLoading] = useState(false);
>>>>>>> e967c63 (refactor : add hierarchical GIS APIs and election result dashboards)
  const [villages, setVillages] = useState(null);


  // =======================================================
  // SELECTION
  // =======================================================

  const [selectedState, setSelectedState] = useState("");

  const [selectedStateCode, setSelectedStateCode] =
    useState("");

  const [selectedDistrict, setSelectedDistrict] =
    useState("");

  const [selectedDistrictCode, setSelectedDistrictCode] =
    useState("");

  const [selectedAssembly, setSelectedAssembly] =
    useState("");

  const [selectedAssemblyNumber, setSelectedAssemblyNumber] =
    useState("");

  const [selectedVillage, setSelectedVillage] =
    useState("");


  // =======================================================
  // SELECTED FEATURES
  // =======================================================

  const [selectedStateFeature, setSelectedStateFeature] =
    useState(null);

  const [selectedDistrictFeature, setSelectedDistrictFeature] =
    useState(null);

  const [selectedAssemblyFeature, setSelectedAssemblyFeature] =
    useState(null);

  const [selectedVillageFeature, setSelectedVillageFeature] =
    useState(null);


  // =======================================================
  // MAP LEVEL
  // =======================================================

  const [mapLevel, setMapLevel] =
    useState("india");


  // =======================================================
  // LOADING
  // =======================================================

  const [loading, setLoading] = useState(true);
  const [statesError, setStatesError] = useState("");


  // =======================================================
  // LOAD STATES
  // =======================================================

  useEffect(() => {

    async function loadStates() {

      try {
<<<<<<< HEAD

        const response = await fetch(
          `${API}/states`
        );

        if (!response.ok) {
          throw new Error(
            "Failed to load states"
          );
        }

        const data = await response.json();

        console.log(
          "States loaded:",
          data?.features?.length
        );

        setStates(data);

      } catch (error) {

        console.error(
          "State loading error:",
          error
        );

=======
        const data = await graphqlRequest("query { states }");
        if (!cancelled) setStates(data.states);
      } catch (error) {
        console.error("State loading error:", error);
        if (!cancelled) setStatesError(error.message || "Unable to load states");
>>>>>>> e967c63 (refactor : add hierarchical GIS APIs and election result dashboards)
      } finally {

        setLoading(false);

      }
    }

    loadStates();

  }, []);

<<<<<<< HEAD

  // =======================================================
  // LOAD UP DATA
  // =======================================================

  useEffect(() => {

    async function loadUPData() {

      try {

        const [
          districtResponse,
          assemblyResponse,
          villageResponse,
        ] = await Promise.all([

          fetch(
            `${API}/districts/uttar-pradesh`
          ),

          fetch(
            `${API}/assemblies/uttar-pradesh`
          ),

          fetch(
            `${API}/villages/uttar-pradesh`
          ),

        ]);


        if (
          !districtResponse.ok ||
          !assemblyResponse.ok ||
          !villageResponse.ok
        ) {

          throw new Error(
            "Failed to load UP GIS data"
          );

        }


        const districtData =
          await districtResponse.json();

        const assemblyData =
          await assemblyResponse.json();

        const villageData =
          await villageResponse.json();


        console.log(
          "Districts loaded:",
          districtData?.features?.length
        );

        console.log(
          "Assemblies loaded:",
          assemblyData?.features?.length
        );

        console.log(
          "Villages loaded:",
          villageData?.features?.length
        );


        setDistricts(districtData);

        setAssemblies(assemblyData);

        setVillages(villageData);

      } catch (error) {

        console.error(
          "UP GIS loading error:",
          error
        );

      }

    }

    loadUPData();

  }, []);


  // =======================================================
  // STATE OPTIONS
  // =======================================================
=======
  // Load only districts in the selected state.
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

  // Fetch child ACs from the selected district on the server.
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

  // Load poll results for the deepest selected hierarchy level.
  useEffect(() => {
    if (!selectedState) {
      setAssemblyDashboard(null);
      setDashboardOpen(false);
      setDashboardError("");
      return;
    }

    let cancelled = false;
    const villageId = selectedVillageFeature?.properties?.village_id;
    const variables = {
      state: selectedState || null,
      districtCode: selectedDistrictCode || null,
      acNo: selectedAssemblyNumber || null,
      villageId: villageId ? Number(villageId) : null,
      level: selectedVillage ? "village" : selectedAssemblyNumber ? "ac" : selectedDistrictCode ? "district" : "state",
    };

    async function loadPollResults() {
      setDashboardLoading(true);
      setDashboardError("");
      setDashboardOpen(true);

      try {
        const result = await graphqlRequest(
          "query ($state: String, $districtCode: String, $acNo: String, $villageId: Int, $level: String!) { pollResults(state: $state, districtCode: $districtCode, acNo: $acNo, villageId: $villageId, level: $level) }",
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
  }, [selectedState, selectedDistrictCode, selectedAssemblyNumber, selectedVillage, selectedVillageFeature]);

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
>>>>>>> e967c63 (refactor : add hierarchical GIS APIs and election result dashboards)

  const stateOptions = useMemo(() => {

    if (!states?.features) {
      return [];
    }

    return [
      ...new Set(
        states.features
          .map(getStateName)
          .filter(Boolean)
      ),
    ].sort();

  }, [states]);


  // =======================================================
  // DISTRICT OPTIONS
  // =======================================================

  const districtOptions = useMemo(() => {
<<<<<<< HEAD

    if (!districts?.features) {
      return [];
    }

    return [
      ...new Set(
        districts.features
          .map(getDistrictName)
          .filter(Boolean)
      ),
    ].sort();

  }, [districts]);


  // =======================================================
  // ASSEMBLY OPTIONS
  // =======================================================

  const assemblyOptions = useMemo(() => {

    if (
      !assemblies?.features ||
      !selectedDistrictCode
    ) {
      return [];
    }

    const filtered =
      assemblies.features.filter(
        (feature) => {

          const assemblyDistrictCode =
            getAssemblyDistrictCode(feature);

          return (
            normalizeCode(
              assemblyDistrictCode
            ) ===
            normalizeCode(
              selectedDistrictCode
            )
          );

        }
      );


    return [
      ...new Map(

        filtered.map((feature) => {

          const acNo =
            getAssemblyNumber(feature);

          const name =
            getAssemblyName(feature);

          return [
            String(acNo),
            name,
          ];

        })

      ).values(),

    ]
      .filter(Boolean)
      .sort();

  }, [
    assemblies,
    selectedDistrictCode,
  ]);


  // =======================================================
  // VILLAGES OF SELECTED ASSEMBLY
  // =======================================================

  const visibleVillages = useMemo(() => {

    if (
      !villages?.features ||
      !selectedDistrictCode ||
      !selectedAssemblyNumber
    ) {
      return [];
    }

    return villages.features.filter(
      (feature) => {

        const villageDistrictCode =
          getVillageDistrictCode(
            feature
          );

        const villageAssemblyNumber =
          getVillageAssemblyNumber(
            feature
          );


        return (

          normalizeCode(
            villageDistrictCode
          ) ===
          normalizeCode(
            selectedDistrictCode
          )

          &&

          normalizeCode(
            villageAssemblyNumber
          ) ===
          normalizeCode(
            selectedAssemblyNumber
          )

        );

      }
    );

  }, [
    villages,
    selectedDistrictCode,
    selectedAssemblyNumber,
  ]);


  // =======================================================
  // VILLAGE OPTIONS
  // =======================================================
=======
    if (!districts?.features) return [];
    return [...new Set(districts.features.map(getDistrictName).filter(Boolean))].sort();
  }, [districts]);

  const assemblyOptions = useMemo(() => {
    if (!assemblies?.features || !selectedDistrictCode) return [];
    return [...new Set(assemblies.features.map(getAssemblyName).filter(Boolean))].sort();
  }, [assemblies, selectedDistrictCode]);
>>>>>>> e967c63 (refactor : add hierarchical GIS APIs and election result dashboards)

  const villageOptions = useMemo(() => {

    return [
      ...new Set(
        visibleVillages
          .map(getVillageName)
          .filter(Boolean)
      ),
    ].sort();

  }, [visibleVillages]);


  // =======================================================
  // STATE CHANGE
  // =======================================================

  const assembliesHaveBoundaries = Boolean(assemblies?.features?.some((feature) => feature.geometry));
  const villagesHaveGeometry = Boolean(villages?.features?.some((feature) => feature.geometry));

  function handleStateChange(stateName) {

    const feature =
      states?.features?.find(
        (item) =>
          String(getStateName(item))
            .toLowerCase()
            .trim() ===
          String(stateName)
            .toLowerCase()
            .trim()
      );


    if (!feature) {
      return;
    }


    const stateCode =
      getStateCode(feature);


    setSelectedState(stateName);

    setSelectedStateCode(
      String(stateCode)
    );


    setSelectedDistrict("");

    setSelectedDistrictCode("");


    setSelectedAssembly("");

    setSelectedAssemblyNumber("");


    setSelectedVillage("");


    setSelectedStateFeature(feature);

    setSelectedDistrictFeature(null);

    setSelectedAssemblyFeature(null);

    setSelectedVillageFeature(null);


    setMapLevel("state");

  }


  // =======================================================
  // DISTRICT CHANGE
  // =======================================================

  function handleDistrictChange(districtName) {
<<<<<<< HEAD

    const feature =
      districts?.features?.find(
        (item) =>
          String(getDistrictName(item))
            .toLowerCase()
            .trim() ===
          String(districtName)
            .toLowerCase()
            .trim()
      );


    if (!feature) {

      console.error(
        "District not found:",
        districtName
      );

      return;

    }


    const districtCode =
      getDistrictCode(feature);


    setSelectedDistrict(
      districtName
=======
    const feature = districts?.features?.find(
      (item) => String(getDistrictName(item)).trim().toLowerCase() === String(districtName).trim().toLowerCase()
>>>>>>> e967c63 (refactor : add hierarchical GIS APIs and election result dashboards)
    );

    setSelectedDistrictCode(
      String(districtCode)
    );


    setSelectedAssembly("");

    setSelectedAssemblyNumber("");

    setSelectedVillage("");


    setSelectedAssemblyFeature(null);

<<<<<<< HEAD
=======
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
>>>>>>> e967c63 (refactor : add hierarchical GIS APIs and election result dashboards)
    setSelectedVillageFeature(null);


    setSelectedDistrictFeature(
      feature
    );

    setMapLevel("district");

  }


  // =======================================================
  // ASSEMBLY CHANGE
  // =======================================================

  function handleAssemblyChange(
    assemblyName
  ) {

    const feature =
      assemblies?.features?.find(
        (item) => {

          const assemblyDistrictCode =
            getAssemblyDistrictCode(item);

          const name =
            getAssemblyName(item);


          return (

            normalizeCode(
              assemblyDistrictCode
            ) ===
            normalizeCode(
              selectedDistrictCode
            )

            &&

            String(name)
              .toLowerCase()
              .trim() ===
            String(assemblyName)
              .toLowerCase()
              .trim()

          );

        }
      );


    if (!feature) {

      console.error(
        "Assembly not found:",
        assemblyName
      );

      return;

    }


    const assemblyNumber =
      getAssemblyNumber(feature);


    setSelectedAssembly(
      assemblyName
    );

    setSelectedAssemblyNumber(
      String(assemblyNumber)
    );


    setSelectedVillage("");

    setSelectedVillageFeature(null);


    setSelectedAssemblyFeature(
      feature
    );

    setMapLevel("assembly");

  }


  // =======================================================
  // VILLAGE CHANGE
  // =======================================================

  function handleVillageChange(
    villageName
  ) {

    const feature =
      visibleVillages.find(
        (item) =>
          String(getVillageName(item))
            .toLowerCase()
            .trim() ===
          String(villageName)
            .toLowerCase()
            .trim()
      );


    if (!feature) {

      console.error(
        "Village not found:",
        villageName
      );

      return;

    }


    setSelectedVillage(
      villageName
    );


    setSelectedVillageFeature(
      feature
    );


    setMapLevel("village");

  }


  // =======================================================
  // STATE MAP CLICK
  // =======================================================

  function handleStateClick(feature) {

    const stateName =
      getStateName(feature);

    if (!stateName) {
      return;
    }

    handleStateChange(
      stateName
    );

  }


  // =======================================================
  // DISTRICT MAP CLICK
  // =======================================================

  function handleDistrictClick(feature) {
<<<<<<< HEAD

    const districtName =
      getDistrictName(feature);

    const districtCode =
      getDistrictCode(feature);


    if (
      !districtName ||
      !districtCode
    ) {
      return;
    }


    handleDistrictChange(
      districtName
    );

=======
    const name = getDistrictName(feature);
    if (name) handleDistrictChange(name);
>>>>>>> e967c63 (refactor : add hierarchical GIS APIs and election result dashboards)
  }


  // =======================================================
  // ASSEMBLY MAP CLICK
  // =======================================================

  function handleAssemblyClick(feature) {
<<<<<<< HEAD

    const assemblyName =
      getAssemblyName(feature);

    const assemblyNumber =
      getAssemblyNumber(feature);


    if (!assemblyNumber) {
      return;
    }


    handleAssemblyChange(
      assemblyName
    );

=======
    const name = getAssemblyName(feature);
    if (name) handleAssemblyChange(name);
>>>>>>> e967c63 (refactor : add hierarchical GIS APIs and election result dashboards)
  }


  // =======================================================
  // VILLAGE MAP CLICK
  // =======================================================

  function handleVillageClick(feature) {

    const villageName =
      getVillageName(feature);

    if (!villageName) {
      return;
    }

    handleVillageChange(
      villageName
    );

  }


  // =======================================================
  // RESET
  // =======================================================

  function resetMap() {

    setSelectedState("");

    setSelectedStateCode("");

    setSelectedDistrict("");

    setSelectedDistrictCode("");

    setSelectedAssembly("");

    setSelectedAssemblyNumber("");

    setSelectedVillage("");

    setSelectedStateFeature(null);

    setSelectedDistrictFeature(null);

    setSelectedAssemblyFeature(null);

    setSelectedVillageFeature(null);

    setMapLevel("india");

  }

<<<<<<< HEAD

  // =======================================================
  // ASSEMBLY COLOR
  // =======================================================

  function getAssemblyColor(
    assemblyNumber
  ) {

    const colors = [

      "#ef4444",
      "#3b82f6",
      "#22c55e",
      "#f59e0b",
      "#8b5cf6",
      "#ec4899",
      "#14b8a6",
      "#f97316",
      "#06b6d4",
      "#84cc16",

    ];


    const number =
      parseInt(
        assemblyNumber,
        10
      );


    if (
      Number.isNaN(number)
    ) {
      return colors[0];
=======
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
>>>>>>> e967c63 (refactor : add hierarchical GIS APIs and election result dashboards)
    }


    return colors[
      number % colors.length
    ];

  }


  // =======================================================
  // VILLAGE COLOR
  // =======================================================

  function getVillageColor(
    feature,
    index
  ) {

    const colors = [

      "#2563eb",
      "#7c3aed",
      "#db2777",
      "#dc2626",
      "#ea580c",
      "#ca8a04",
      "#16a34a",
      "#059669",
      "#0891b2",
      "#4f46e5",
      "#9333ea",
      "#e11d48",
      "#0d9488",
      "#65a30d",
      "#c026d3",
      "#0284c7",

    ];


    const villageName =
      getVillageName(feature) || "";


    let hash = 0;

    for (
      let i = 0;
      i < villageName.length;
      i++
    ) {

      hash =
        villageName.charCodeAt(i) +
        ((hash << 5) - hash);

    }


    const colorIndex =
      Math.abs(
        hash + index
      ) % colors.length;


    return colors[colorIndex];

  }


  // =======================================================
  // LOADING
  // =======================================================

  if (loading) {

    return (

      <div className="loading-screen">

        <div className="loader"></div>

        <h2>
          Loading GIS Dashboard
        </h2>

      </div>

    );

  }


<<<<<<< HEAD
  // =======================================================
  // UI
  // =======================================================
=======
  const currentLocation =
    selectedVillage || selectedAssembly || selectedDistrict || selectedState || "India";
  const dashboardTitle = currentLocation;
  const dashboardSubtitle = [selectedState, selectedDistrict, selectedAssembly, selectedVillage]
    .filter(Boolean)
    .join(" / ");
>>>>>>> e967c63 (refactor : add hierarchical GIS APIs and election result dashboards)

  return (

    <div className="app">


      {/* ===================================================
          HEADER
      =================================================== */}

      <header className="header">

        <div>

          <div className="brand">
            Electoral Intelligence
          </div>

          <div className="subtitle">
            GIS Dashboard Prototype
          </div>

        </div>


        <button
          className="reset-button"
          onClick={resetMap}
        >
          Reset Map
        </button>

      </header>


      {/* ===================================================
          MAIN
      =================================================== */}

      <div className="main-layout">


        {/* =================================================
            SIDEBAR
        ================================================= */}

        <aside className="sidebar">

<<<<<<< HEAD

          <div className="section-title">
            LOCATION EXPLORER
=======
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
>>>>>>> e967c63 (refactor : add hierarchical GIS APIs and election result dashboards)
          </div>


          {/* STATE */}

          <SearchSelect
            label="State"
            value={selectedState}
            options={stateOptions}
            placeholder="Select state"
            onChange={handleStateChange}
          />


          {/* DISTRICT */}

          <SearchSelect
            label="District"
            value={selectedDistrict}
            options={districtOptions}
            placeholder={
              selectedState
                ? "Select district"
                : "Select state first"
            }
            disabled={!selectedState}
            onChange={handleDistrictChange}
          />


          {/* ASSEMBLY */}

          <SearchSelect
            label="Assembly"
            value={selectedAssembly}
            options={assemblyOptions}
            placeholder={
              selectedDistrict
                ? "Select assembly"
                : "Select district first"
            }
            disabled={!selectedDistrict}
            onChange={handleAssemblyChange}
          />


          {/* VILLAGE */}

          <SearchSelect
            label="Village"
            value={selectedVillage}
            options={villageOptions}
            placeholder={
              selectedAssembly
                ? (
                  villageOptions.length > 0
                    ? "Select village"
                    : "No villages found"
                )
                : "Select assembly first"
            }
            disabled={
              !selectedAssembly ||
              villageOptions.length === 0
            }
            onChange={handleVillageChange}
          />


          {/* =================================================
              LAYER LEGEND
          ================================================= */}

          <div className="layer-section">

            <div className="section-title">
              MAP LAYERS
            </div>


            <div className="layer-item">

              <span className="layer-dot state-dot"></span>

              State Boundaries

            </div>


            <div className="layer-item">

              <span className="layer-dot district-dot"></span>

              District Boundaries

            </div>


            <div className="layer-item">

              <span className="layer-dot assembly-dot"></span>

              Assembly Boundaries

            </div>


            <div className="layer-item">

              <span className="village-boundary-dot"></span>

              Village Boundaries

            </div>

          </div>


          {/* =================================================
              LOCATION INFO
          ================================================= */}

          <div className="location-card">

            <div className="small-label">
              CURRENT LOCATION
            </div>


            <div className="location-value">

              {
                selectedVillage ||
                selectedAssembly ||
                selectedDistrict ||
                selectedState ||
                "India"
              }

            </div>


            <div className="breadcrumb">

              India

              {selectedState &&
                ` / ${selectedState}`}

              {selectedDistrict &&
                ` / ${selectedDistrict}`}

              {selectedAssembly &&
                ` / ${selectedAssembly}`}

              {selectedVillage &&
                ` / ${selectedVillage}`}

            </div>

          </div>


          {/* =================================================
              DATA COUNTS
          ================================================= */}

          <div className="stats-card">

            <div className="stat-row">

              <span>
                Districts
              </span>

              <strong>

                {
                  selectedState
                    ? districts?.features?.length || 0
                    : 0
                }

              </strong>

            </div>


            <div className="stat-row">

              <span>
                Assemblies
              </span>

              <strong>

                {
                  selectedDistrictCode
                    ? assemblyOptions.length
                    : "—"
                }

              </strong>

            </div>


            <div className="stat-row">

              <span>
                Villages
              </span>

              <strong>

                {
                  selectedAssemblyNumber
                    ? visibleVillages.length
                    : "—"
                }

              </strong>

            </div>

          </div>


        </aside>


        {/* =================================================
            MAP
        ================================================= */}

        <main className="map-container">


          <MapContainer
<<<<<<< HEAD
            center={[
              22.5,
              79.0,
            ]}
            zoom={5}
=======
            center={[22.5, 79.0]}
            zoom={4}
>>>>>>> e967c63 (refactor : add hierarchical GIS APIs and election result dashboards)
            minZoom={4}
            maxZoom={18}
            scrollWheelZoom={true}
            zoomControl={true}
            className="map"
          >
<<<<<<< HEAD
=======
            <MapInitialBounds featureCollection={states} />
            {layersVisible.osm && (
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            )}
>>>>>>> e967c63 (refactor : add hierarchical GIS APIs and election result dashboards)


            {/* =================================================
                BASE MAP
            ================================================= */}

            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />


            {/* =================================================
                INDIA / STATE LAYER
            ================================================= */}

            {states && (

              <GeoJSON
                key="india-states"
                data={states}

                style={(feature) => {

                  const stateCode =
                    getStateCode(feature);

                  const selected =
                    normalizeCode(stateCode) ===
                    normalizeCode(selectedStateCode);

                  return {

                    color:
                      selected
                        ? "#0f172a"
                        : "#475569",

                    weight:
                      selected
                        ? 3
                        : 1.4,

                    fillColor:
                      selected
                        ? "#60a5fa"
                        : "#cbd5e1",

                    fillOpacity:
                      selected
                        ? 0.28
                        : 0.08,

                  };

                }}

                onEachFeature={
                  (feature, layer) => {

                    const name =
                      getStateName(feature);

                    layer.bindTooltip(
                      name || "State",
                      {
                        sticky: true,
                      }
                    );


                    layer.on({

                      click: () => {

                        handleStateClick(
                          feature
                        );

                      },


                      mouseover: (event) => {

                        event.target.setStyle({

                          weight: 3,

                          fillOpacity: 0.25,

                        });

                      },


                      mouseout: (event) => {

                        const code =
                          getStateCode(
                            feature
                          );

                        const selected =
                          normalizeCode(code) ===
                          normalizeCode(
                            selectedStateCode
                          );

                        event.target.setStyle({

                          weight:
                            selected
                              ? 3
                              : 1.4,

                          fillOpacity:
                            selected
                              ? 0.28
                              : 0.08,

                        });

                      },

                    });

                  }
                }

              />

            )}

<<<<<<< HEAD

            {/* =================================================
                DISTRICT LAYER
            ================================================= */}

            {
              selectedState &&
              districts && (

                <GeoJSON

                  key="up-districts"

                  data={districts}

                  style={(feature) => {

                    const code =
                      getDistrictCode(
                        feature
                      );

                    const selected =
                      normalizeCode(code) ===
                      normalizeCode(
                        selectedDistrictCode
                      );

                    return {

                      color:
                        selected
                          ? "#111827"
                          : "#2563eb",

                      weight:
                        selected
                          ? 3
                          : 1.5,

                      fillColor:
                        "#60a5fa",

                      fillOpacity:
                        selected
                          ? 0.30
                          : 0.08,

                    };

                  }}

                  onEachFeature={
                    (feature, layer) => {

                      const name =
                        getDistrictName(
                          feature
                        );

                      const code =
                        getDistrictCode(
                          feature
                        );


                      layer.bindTooltip(
                        name || "District",
                        {
                          sticky: true,
                        }
                      );


                      layer.on({

                        click: () => {

                          handleDistrictClick(
                            feature
                          );

                        },


                        mouseover: (event) => {

                          event.target.setStyle({

                            weight: 3,

                            fillOpacity: 0.25,

                          });

                        },


                        mouseout: (event) => {

                          const selected =
                            normalizeCode(code) ===
                            normalizeCode(
                              selectedDistrictCode
                            );

                          event.target.setStyle({

                            weight:
                              selected
                                ? 3
                                : 1.5,

                            fillOpacity:
                              selected
                                ? 0.30
                                : 0.08,

                          });

                        },

                      });

                    }
                  }

                />

              )
            }


            {/* =================================================
                ASSEMBLY LAYER
            ================================================= */}

            {
=======
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

            {layersVisible.assemblies &&
>>>>>>> e967c63 (refactor : add hierarchical GIS APIs and election result dashboards)
              selectedDistrictCode &&
              assemblies && (

                <GeoJSON
<<<<<<< HEAD

                  key={
                    `assemblies-${selectedDistrictCode}`
                  }

                  data={assemblies}

                  filter={(feature) => {

                    const assemblyDistrictCode =
                      getAssemblyDistrictCode(
                        feature
                      );

                    return (
                      normalizeCode(
                        assemblyDistrictCode
                      ) ===
                      normalizeCode(
                        selectedDistrictCode
                      )
                    );

                  }}

=======
                  key={`assemblies-${selectedDistrictCode}`}
                  data={assemblies}
                  filter={(feature) => {
                    const districtCode = getAssemblyDistrictCode(feature);
                    const hasDistrictCodes = assemblies.features.some((item) => {
                      const code = getAssemblyDistrictCode(item);
                      return code !== undefined && code !== null && code !== "";
                    });
                    return Boolean(feature.geometry) && (!hasDistrictCodes || normalizeCode(districtCode) === normalizeCode(selectedDistrictCode));
                  }}
>>>>>>> e967c63 (refactor : add hierarchical GIS APIs and election result dashboards)
                  style={(feature) => {

                    const acNo =
                      getAssemblyNumber(
                        feature
                      );

                    const selected =
                      normalizeCode(acNo) ===
                      normalizeCode(
                        selectedAssemblyNumber
                      );

                    const color =
                      getAssemblyColor(
                        acNo
                      );

                    return {

                      color:
                        selected
                          ? "#111827"
                          : color,

                      weight:
                        selected
                          ? 3
                          : 1.3,

                      fillColor:
                        color,

                      fillOpacity:
                        selected
                          ? 0.48
                          : 0.22,

                    };

                  }}

                  onEachFeature={
                    (feature, layer) => {

                      const name =
                        getAssemblyName(
                          feature
                        );

                      const acNo =
                        getAssemblyNumber(
                          feature
                        );


                      layer.bindTooltip(

                        `${name || "Assembly"}${
                          acNo
                            ? ` (AC ${acNo})`
                            : ""
                        }`,

                        {
                          sticky: true,
                        }

                      );


                      layer.on({

                        click: () => {

                          handleAssemblyClick(
                            feature
                          );

                        },


                        mouseover: (event) => {

                          event.target.setStyle({

                            weight: 3,

                            fillOpacity: 0.42,

                          });

                        },


                        mouseout: (event) => {

                          const selected =
                            normalizeCode(acNo) ===
                            normalizeCode(
                              selectedAssemblyNumber
                            );

                          const color =
                            getAssemblyColor(
                              acNo
                            );

                          event.target.setStyle({

                            color:
                              selected
                                ? "#111827"
                                : color,

                            weight:
                              selected
                                ? 3
                                : 1.3,

                            fillOpacity:
                              selected
                                ? 0.48
                                : 0.22,

                          });

                        },

                      });

                    }
                  }

                />

              )
            }


            {/* =================================================
                VILLAGE BOUNDARIES
                NO HOTSPOT MARKERS
            ================================================= */}

            {
              selectedAssemblyNumber &&
              visibleVillages.length > 0 && (

                <GeoJSON

                  key={
                    `villages-${selectedDistrictCode}-${selectedAssemblyNumber}-${selectedVillage}`
                  }

                  data={{
                    type: "FeatureCollection",

                    features:
                      visibleVillages,

                  }}

                  style={(feature) => {

                    const index =
                      visibleVillages.indexOf(
                        feature
                      );

                    const color =
                      getVillageColor(
                        feature,
                        index
                      );

                    const selected =
                      String(
                        getVillageName(feature)
                      )
                        .toLowerCase()
                        .trim() ===
                      String(selectedVillage)
                        .toLowerCase()
                        .trim();

                    return {

                      color:
                        selected
                          ? "#111827"
                          : color,

                      weight:
                        selected
                          ? 3
                          : 1,

                      fillColor:
                        color,

                      fillOpacity:
                        selected
                          ? 0.48
                          : 0.18,

                    };

                  }}

                  onEachFeature={
                    (feature, layer) => {

                      const name =
                        getVillageName(
                          feature
                        );

                      const index =
                        visibleVillages.indexOf(
                          feature
                        );

                      const color =
                        getVillageColor(
                          feature,
                          index
                        );


                      layer.bindTooltip(
                        name || "Village",
                        {
                          sticky: true,
                        }
                      );


                      layer.on({

                        click: () => {

                          handleVillageClick(
                            feature
                          );

                        },


                        mouseover: (event) => {

                          event.target.setStyle({

                            weight: 3,

                            fillOpacity: 0.42,

                          });

                        },


                        mouseout: (event) => {

                          const selected =
                            String(
                              getVillageName(
                                feature
                              )
                            )
                              .toLowerCase()
                              .trim() ===
                            String(
                              selectedVillage
                            )
                              .toLowerCase()
                              .trim();

                          event.target.setStyle({

                            color:
                              selected
                                ? "#111827"
                                : color,

                            weight:
                              selected
                                ? 3
                                : 1,

                            fillOpacity:
                              selected
                                ? 0.48
                                : 0.18,

                          });

                        },

                      });

                    }
                  }

                />

              )
            }


            {/* =================================================
                AUTO ZOOM
            ================================================= */}

            <MapController

              selectedFeature={
                selectedVillageFeature ||
                selectedAssemblyFeature ||
                selectedDistrictFeature ||
                selectedStateFeature
              }

              level={mapLevel}

            />

          </MapContainer>


          {/* =================================================
              MAP LEVEL BADGE
          ================================================= */}

          <div className="map-info">

            {
              selectedVillage
                ? "Village View"
                : selectedAssembly
                ? "Assembly View"
                : selectedDistrict
                ? "District View"
                : selectedState
                ? "State View"
                : "India View"
            }

<<<<<<< HEAD
          </div>


          {/* =================================================
              SELECTED LOCATION PANEL
          ================================================= */}

          {
            (
              selectedState ||
              selectedDistrict ||
              selectedAssembly ||
              selectedVillage
            ) && (

              <div className="selected-panel">

                <div className="panel-label">
                  SELECTED LOCATION
                </div>


                <div className="panel-title">

                  {
                    selectedVillage ||
                    selectedAssembly ||
                    selectedDistrict ||
                    selectedState
                  }

                </div>


                <div className="panel-path">

                  India

                  {selectedState &&
                    ` → ${selectedState}`}

                  {selectedDistrict &&
                    ` → ${selectedDistrict}`}

                  {selectedAssembly &&
                    ` → ${selectedAssembly}`}

                  {selectedVillage &&
                    ` → ${selectedVillage}`}

                </div>


                {
                  selectedAssemblyNumber && (

                    <div className="panel-meta">

                      AC No:{" "}

                      <strong>
                        {
                          selectedAssemblyNumber
                        }
                      </strong>

                    </div>

                  )
                }


                {
                  selectedAssemblyNumber && (

                    <div className="panel-meta">

                      Villages:{" "}

                      <strong>
                        {
                          visibleVillages.length
                        }
                      </strong>

                    </div>

                  )
                }


                {
                  selectedVillage && (

                    <div className="panel-meta village-selected-meta">

                      Selected Village:{" "}

                      <strong>
                        {
                          selectedVillage
                        }
                      </strong>

                    </div>

                  )
                }

              </div>

            )
          }

=======
            <div className="map-breadcrumb">
              India
              {selectedState && ` / ${selectedState}`}
              {selectedDistrict && ` / ${selectedDistrict}`}
              {selectedAssembly && ` / ${selectedAssembly}`}
              {selectedVillage && ` / ${selectedVillage}`}
            </div>
            {selectedDistrict && !assembliesHaveBoundaries && (
              <div className="map-data-notice">
                Assembly records are available, but their boundary geometry is empty in the database. Choose an assembly from the sidebar to open its dashboard.
              </div>
            )}
            {selectedAssembly && villageOptions.length > 0 && !villagesHaveGeometry && (
              <div className="map-data-notice">
                Village records are available, but their map geometry is empty in the database.
              </div>
            )}
          </div>

          {/* Reopen button appears after dashboard is closed */}
          {selectedState && !dashboardOpen && (
            <button
              type="button"
              className="dashboard-reopen-button"
              onClick={() => setDashboardOpen(true)}
            >
              <span>▤</span>
              Poll Results
            </button>
          )}

          {/* Dashboard closes independently; selection remains active */}
          {dashboardOpen && (
            <AssemblyDashboard
              data={assemblyDashboard}
              loading={dashboardLoading}
              error={dashboardError}
              title={dashboardTitle}
              subtitle={dashboardSubtitle}
              onClose={closeDashboard}
            />
          )}
>>>>>>> e967c63 (refactor : add hierarchical GIS APIs and election result dashboards)
        </main>

      </div>

    </div>

  );
}
