import { useEffect, useMemo, useState } from "react";

import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
} from "react-leaflet";

import L from "leaflet";

import "leaflet/dist/leaflet.css";
import "./index.css";

// =========================================================
// API
// =========================================================

const API = "http://127.0.0.1:8000/api/gis";


// =========================================================
// PROPERTY HELPER
// =========================================================

function getProperty(properties, names) {
  if (!properties) return "";

  const keys = Object.keys(properties);

  for (const name of names) {
    const key = keys.find(
      (k) =>
        String(k).toLowerCase() ===
        String(name).toLowerCase()
    );

    if (key !== undefined) {
      return properties[key];
    }
  }

  return "";
}


// =========================================================
// NORMALIZE CODE
// =========================================================

function normalizeCode(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  const str = String(value).trim();

  if (!str) return "";

  return str.replace(/^0+/, "") || "0";
}


// =========================================================
// STATE
// =========================================================

function getStateName(feature) {
  return getProperty(
    feature?.properties,
    [
      "STNAME",
      "ST_NAME",
      "state_name",
      "State_Name",
      "STATE",
    ]
  );
}


function getStateCode(feature) {
  return getProperty(
    feature?.properties,
    [
      "STCODE11",
      "ST_CODE",
      "State_LGD",
      "state_code",
    ]
  );
}


// =========================================================
// DISTRICT
// =========================================================

function getDistrictName(feature) {
  return getProperty(
    feature?.properties,
    [
      "dtname",
      "DTNAME",
      "DIST_NAME",
      "dtname11",
      "district",
      "district_name",
    ]
  );
}


function getDistrictCode(feature) {
  return getProperty(
    feature?.properties,
    [
      "dtcode11",
      "DT_CODE",
      "Dist_LGD",
      "dist_lgd",
      "district_code",
    ]
  );
}


// =========================================================
// ASSEMBLY
// =========================================================

function getAssemblyName(feature) {
  return getProperty(
    feature?.properties,
    [
      "AC_NAME",
      "ac_name",
      "assembly",
      "assembly_name",
    ]
  );
}


function getAssemblyNumber(feature) {
  return getProperty(
    feature?.properties,
    [
      "AC_NO",
      "ac_no",
      "acno",
      "ACNO",
      "assembly_no",
      "assembly_number",
    ]
  );
}


function getAssemblyDistrictCode(feature) {
  return getProperty(
    feature?.properties,
    [
      "dtcode11",
      "DT_CODE",
      "dist_lgd",
      "Dist_LGD",
      "district_code",
    ]
  );
}


// =========================================================
// SEARCH SELECT
// =========================================================

function SearchSelect({
  label,
  value,
  options,
  placeholder,
  onChange,
  disabled = false,
}) {
  const [open, setOpen] =
    useState(false);

  const [search, setSearch] =
    useState("");

  const filteredOptions =
    useMemo(() => {
      if (!search.trim()) {
        return options;
      }

      return options.filter(
        (option) =>
          String(option)
            .toLowerCase()
            .includes(
              search.toLowerCase()
            )
      );
    }, [
      options,
      search,
    ]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setSearch("");
    }
  }, [disabled]);

  return (
    <div className="select-wrapper">

      <label className="field-label">
        {label}
      </label>

      <div
        className={`custom-select ${
          disabled
            ? "disabled"
            : ""
        }`}
        onClick={() => {
          if (!disabled) {
            setOpen(
              (prev) => !prev
            );
          }
        }}
      >

        <div
          className={
            value
              ? "selected-value"
              : "selected-value placeholder"
          }
        >
          {value || placeholder}
        </div>

        <span className="select-arrow">
          {open ? "⌃" : "⌄"}
        </span>

      </div>

      {open && !disabled && (
        <div
          className="select-dropdown"
          onClick={(e) =>
            e.stopPropagation()
          }
        >

          <div className="search-box">

            <span>⌕</span>

            <input
              autoFocus
              placeholder={`Search ${label.toLowerCase()}...`}
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
            />

          </div>

          <div className="options-list">

            {filteredOptions.length === 0 ? (

              <div className="no-option">
                No results found
              </div>

            ) : (

              filteredOptions.map(
                (option) => (

                  <div
                    key={String(option)}
                    className={`option ${
                      String(option) ===
                      String(value)
                        ? "active-option"
                        : ""
                    }`}
                    onClick={() => {

                      onChange(
                        option
                      );

                      setSearch("");

                      setOpen(false);
                    }}
                  >

                    <span>
                      {option}
                    </span>

                    {String(option) ===
                      String(value) && (
                      <span>✓</span>
                    )}

                  </div>

                )
              )

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

function MapController({
  selectedFeature,
  level,
  dashboardOpen,
}) {
  const map = useMap();

  useEffect(() => {

    if (!selectedFeature) {
      return;
    }

    try {

      const layer =
        L.geoJSON(
          selectedFeature
        );

      const bounds =
        layer.getBounds();

      if (bounds.isValid()) {

        let maxZoom = 7;

        if (level === "state") {
          maxZoom = 7;
        }

        if (level === "district") {
          maxZoom = 10;
        }

        if (level === "assembly") {
          maxZoom = 12;
        }

        map.flyToBounds(
          bounds,
          {
            paddingTopLeft: [
              40,
              40,
            ],

            paddingBottomRight:
              dashboardOpen
                ? [470, 40]
                : [420, 40],

            duration: 1.15,

            easeLinearity: 0.2,

            maxZoom,
          }
        );
      }

    } catch (error) {

      console.error(
        "Map zoom error:",
        error
      );

    }

  }, [
    selectedFeature,
    level,
    map,
    dashboardOpen,
  ]);

  return null;
}


// =========================================================
// ASSEMBLY COLORS
// =========================================================

const ASSEMBLY_COLORS = [
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


function getAssemblyColor(
  assemblyNumber
) {

  const number =
    parseInt(
      assemblyNumber,
      10
    );

  if (
    Number.isNaN(number)
  ) {
    return ASSEMBLY_COLORS[0];
  }

  return ASSEMBLY_COLORS[
    Math.abs(number) %
      ASSEMBLY_COLORS.length
  ];
}


// =========================================================
// FORMAT VALUE
// =========================================================

function formatNumber(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const number =
    Number(value);

  if (
    !Number.isNaN(number)
  ) {
    return number.toLocaleString(
      "en-IN"
    );
  }

  return value;
}


function formatPercent(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  return `${value}%`;
}


// =========================================================
// PARTY BAND CARD
// =========================================================

function BandRow({
  band,
  booths,
  percent,
}) {

  return (
    <div className="band-row">

      <div className="band-left">

        <span
          className={`band-dot band-${band.toLowerCase()}`}
        />

        <span className="band-name">
          {band}
        </span>

      </div>

      <div className="band-values">

        <strong>
          {formatNumber(
            booths
          )}
        </strong>

        <span>
          {formatPercent(
            percent
          )}
        </span>

      </div>

    </div>
  );
}


// =========================================================
// ASSEMBLY DASHBOARD
// =========================================================

function AssemblyDashboard({
  data,
  loading,
  error,
  onClose,
}) {

  if (!data && loading) {

    return (
      <div className="assembly-dashboard">

        <div className="dashboard-header">

          <div>

            <div className="dashboard-eyebrow">
              ASSEMBLY DASHBOARD
            </div>

            <h2>
              Loading...
            </h2>

          </div>

          <button
            className="dashboard-close"
            onClick={onClose}
          >
            ×
          </button>

        </div>

        <div className="dashboard-loading">

          <div className="dashboard-loader"></div>

          <p>
            Loading assembly data...
          </p>

        </div>

      </div>
    );
  }


  if (error) {

    return (
      <div className="assembly-dashboard">

        <div className="dashboard-header">

          <div>

            <div className="dashboard-eyebrow">
              ASSEMBLY DASHBOARD
            </div>

            <h2>
              Data unavailable
            </h2>

          </div>

          <button
            className="dashboard-close"
            onClick={onClose}
          >
            ×
          </button>

        </div>

        <div className="dashboard-error">

          <strong>
            Unable to load assembly data
          </strong>

          <p>
            {error}
          </p>

        </div>

      </div>
    );
  }


  if (!data) {
    return null;
  }


  const overview =
    data.overview || {};

  const bands =
    data.party_band_summary || {};

  const checks =
    data.data_checks || {};


  const bjp =
    bands.BJP || {};

  const rld =
    bands.RLD || {};


  return (
    <div className="assembly-dashboard">

      {/* =================================================
          DASHBOARD HEADER
      ================================================= */}

      <div className="dashboard-header">

        <div>

          <div className="dashboard-eyebrow">
            ASSEMBLY DASHBOARD
          </div>

          <h2>
            {overview.ac_name ||
              "Assembly"}
          </h2>

          <div className="dashboard-subtitle">

            AC {overview.ac_no ?? "—"}

            {overview.district_name &&
              ` • ${overview.district_name}`}

          </div>

        </div>

        <button
          className="dashboard-close"
          onClick={onClose}
        >
          ×
        </button>

      </div>


      <div className="dashboard-scroll">


        {/* =================================================
            1. ASSEMBLY OVERVIEW
        ================================================= */}

        <section className="dashboard-section">

          <div className="dashboard-section-title">
            01 · ASSEMBLY OVERVIEW
          </div>

          <div className="overview-grid">

            <div className="overview-card">

              <span>
                AC No.
              </span>

              <strong>
                {overview.ac_no ?? "—"}
              </strong>

            </div>


            <div className="overview-card">

              <span>
                Assembly Name
              </span>

              <strong>
                {overview.ac_name ||
                  "—"}
              </strong>

            </div>


            <div className="overview-card">

              <span>
                District Name
              </span>

              <strong>
                {overview.district_name ||
                  "—"}
              </strong>

            </div>

          </div>

        </section>


        {/* =================================================
            2. PARTY BAND SUMMARY
        ================================================= */}

        <section className="dashboard-section">

          <div className="dashboard-section-title">
            02 · PARTY BAND SUMMARY
          </div>


          {/* BJP */}

          <div className="party-card">

            <div className="party-card-header">

              <div className="party-name">
                BJP
              </div>

              <div className="party-column-labels">

                <span>
                  Booths
                </span>

                <span>
                  Share
                </span>

              </div>

            </div>


            <BandRow
              band="Red"
              booths={
                bjp.Red?.booths
              }
              percent={
                bjp.Red?.percent
              }
            />

            <BandRow
              band="Amber"
              booths={
                bjp.Amber?.booths
              }
              percent={
                bjp.Amber?.percent
              }
            />

            <BandRow
              band="Yellow"
              booths={
                bjp.Yellow?.booths
              }
              percent={
                bjp.Yellow?.percent
              }
            />

            <BandRow
              band="Green"
              booths={
                bjp.Green?.booths
              }
              percent={
                bjp.Green?.percent
              }
            />

          </div>


          {/* RLD */}

          <div className="party-card">

            <div className="party-card-header">

              <div className="party-name">
                RLD
              </div>

              <div className="party-column-labels">

                <span>
                  Booths
                </span>

                <span>
                  Share
                </span>

              </div>

            </div>


            <BandRow
              band="Red"
              booths={
                rld.Red?.booths
              }
              percent={
                rld.Red?.percent
              }
            />

            <BandRow
              band="Amber"
              booths={
                rld.Amber?.booths
              }
              percent={
                rld.Amber?.percent
              }
            />

            <BandRow
              band="Yellow"
              booths={
                rld.Yellow?.booths
              }
              percent={
                rld.Yellow?.percent
              }
            />

            <BandRow
              band="Green"
              booths={
                rld.Green?.booths
              }
              percent={
                rld.Green?.percent
              }
            />

          </div>

        </section>


        {/* =================================================
            3. DATA CHECKS
        ================================================= */}

        <section className="dashboard-section">

          <div className="dashboard-section-title">
            03 · DATA CHECKS
          </div>


          <div className="checks-grid">

            <div className="check-card">

              <span>
                Booth Records
              </span>

              <strong>
                {formatNumber(
                  checks.booth_records
                )}
              </strong>

            </div>


            <div className="check-card">

              <span>
                Total Votes
              </span>

              <strong>
                {formatNumber(
                  checks.total_votes
                )}
              </strong>

            </div>


            <div className="check-card">

              <span>
                BJP Votes
              </span>

              <strong>
                {formatNumber(
                  checks.bjp_votes
                )}
              </strong>

            </div>


            <div className="check-card">

              <span>
                BJP Vote Share
              </span>

              <strong>
                {formatPercent(
                  checks.bjp_vote_share
                )}
              </strong>

            </div>


            <div className="check-card">

              <span>
                RLD Votes
              </span>

              <strong>
                {formatNumber(
                  checks.rld_votes
                )}
              </strong>

            </div>


            <div className="check-card">

              <span>
                RLD Vote Share
              </span>

              <strong>
                {formatPercent(
                  checks.rld_vote_share
                )}
              </strong>

            </div>

          </div>

        </section>


        {/* =================================================
            DATA SOURCE
        ================================================= */}

        <div className="dashboard-source">

          <span className="source-dot"></span>

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

  // =======================================================
  // DATA
  // =======================================================

  const [states, setStates] =
    useState(null);

  const [districts, setDistricts] =
    useState(null);

  const [assemblies, setAssemblies] =
    useState(null);


  // =======================================================
  // SELECTION
  // =======================================================

  const [selectedState, setSelectedState] =
    useState("");

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


  // =======================================================
  // SELECTED FEATURES
  // =======================================================

  const [selectedStateFeature, setSelectedStateFeature] =
    useState(null);

  const [selectedDistrictFeature, setSelectedDistrictFeature] =
    useState(null);

  const [selectedAssemblyFeature, setSelectedAssemblyFeature] =
    useState(null);


  // =======================================================
  // MAP
  // =======================================================

  const [mapLevel, setMapLevel] =
    useState("india");


  // =======================================================
  // LOADING
  // =======================================================

  const [loading, setLoading] =
    useState(true);


  // =======================================================
  // ASSEMBLY DASHBOARD
  // =======================================================

  const [
    assemblyDashboard,
    setAssemblyDashboard,
  ] = useState(null);

  const [
    dashboardLoading,
    setDashboardLoading,
  ] = useState(false);

  const [
    dashboardError,
    setDashboardError,
  ] = useState("");

  const [
    dashboardOpen,
    setDashboardOpen,
  ] = useState(false);


  // =======================================================
  // LOAD STATES
  // =======================================================

  useEffect(() => {

    async function loadStates() {

      try {

        const response =
          await fetch(
            `${API}/states`
          );

        if (!response.ok) {

          throw new Error(
            "Failed to load states"
          );

        }

        const data =
          await response.json();

        setStates(data);

      } catch (error) {

        console.error(
          "State loading error:",
          error
        );

      } finally {

        setLoading(false);

      }

    }

    loadStates();

  }, []);


  // =======================================================
  // LOAD UP GIS
  // =======================================================

  useEffect(() => {

    async function loadUPData() {

      try {

        const [
          districtResponse,
          assemblyResponse,
        ] = await Promise.all([

          fetch(
            `${API}/districts/uttar-pradesh`
          ),

          fetch(
            `${API}/assemblies/uttar-pradesh`
          ),

        ]);


        if (
          !districtResponse.ok ||
          !assemblyResponse.ok
        ) {

          throw new Error(
            "Failed to load UP GIS data"
          );

        }


        const districtData =
          await districtResponse.json();

        const assemblyData =
          await assemblyResponse.json();


        setDistricts(
          districtData
        );

        setAssemblies(
          assemblyData
        );

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
  // LOAD ASSEMBLY DASHBOARD
  // =======================================================

  useEffect(() => {

    if (
      !selectedAssemblyNumber
    ) {

      setAssemblyDashboard(null);
      setDashboardOpen(false);
      setDashboardError("");

      return;

    }


    async function loadAssemblyDashboard() {

      setDashboardLoading(true);

      setDashboardError("");

      try {

        const response =
          await fetch(
            `${API}/assembly-dashboard/${encodeURIComponent(
              selectedAssemblyNumber
            )}`
          );


        if (!response.ok) {

          let message =
            "Failed to load assembly dashboard";

          try {

            const errorData =
              await response.json();

            if (
              errorData?.detail
            ) {

              message =
                errorData.detail;

            }

          } catch {
            // Ignore JSON parsing error
          }

          throw new Error(
            message
          );

        }


        const data =
          await response.json();


        setAssemblyDashboard(
          data
        );

        setDashboardOpen(
          true
        );

      } catch (error) {

        console.error(
          "Assembly dashboard error:",
          error
        );

        setAssemblyDashboard(
          null
        );

        setDashboardError(
          error.message ||
          "Unable to load assembly dashboard"
        );

        setDashboardOpen(
          true
        );

      } finally {

        setDashboardLoading(
          false
        );

      }

    }


    loadAssemblyDashboard();

  }, [
    selectedAssemblyNumber,
  ]);


  // =======================================================
  // IS SELECTED STATE UTTAR PRADESH?
  // =======================================================

  const isUttarPradesh =
    selectedState
      ?.trim()
      .toLowerCase() ===
    "uttar pradesh";


  // =======================================================
  // STATE OPTIONS
  // =======================================================

  const stateOptions =
    useMemo(() => {

      if (
        !states?.features
      ) {

        return [];

      }


      return [
        ...new Set(

          states.features
            .map(getStateName)
            .filter(Boolean)

        ),
      ].sort();

    }, [
      states,
    ]);


  // =======================================================
  // DISTRICT OPTIONS
  // ONLY FOR UTTAR PRADESH
  // =======================================================

  const districtOptions =
    useMemo(() => {

      if (
        !isUttarPradesh ||
        !districts?.features
      ) {

        return [];

      }


      return [
        ...new Set(

          districts.features
            .map(getDistrictName)
            .filter(Boolean)

        ),
      ].sort();

    }, [
      districts,
      isUttarPradesh,
    ]);


  // =======================================================
  // ASSEMBLY OPTIONS
  // =======================================================

  const assemblyOptions =
    useMemo(() => {

      if (
        !isUttarPradesh ||
        !assemblies?.features ||
        !selectedDistrictCode
      ) {

        return [];

      }


      const filtered =
        assemblies.features.filter(
          (feature) => {

            return (
              normalizeCode(
                getAssemblyDistrictCode(
                  feature
                )
              ) ===
              normalizeCode(
                selectedDistrictCode
              )
            );

          }
        );


      return [
        ...new Map(

          filtered.map(
            (feature) => {

              const acNo =
                getAssemblyNumber(
                  feature
                );

              const name =
                getAssemblyName(
                  feature
                );

              return [
                String(acNo),
                name,
              ];

            }
          )

        ).values(),

      ]
        .filter(Boolean)
        .sort();

    }, [
      assemblies,
      selectedDistrictCode,
      isUttarPradesh,
    ]);


  // =======================================================
  // STATE CHANGE
  // =======================================================

  function handleStateChange(
    stateName
  ) {

    const feature =
      states?.features?.find(
        (item) =>

          String(
            getStateName(item)
          )
            .toLowerCase()
            .trim() ===

          String(stateName)
            .toLowerCase()
            .trim()

      );


    if (!feature) {
      return;
    }


    const normalizedState =
      String(stateName).trim();


    setSelectedState(
      normalizedState
    );


    setSelectedStateCode(
      String(
        getStateCode(feature)
      )
    );


    setSelectedDistrict("");
    setSelectedDistrictCode("");

    setSelectedAssembly("");
    setSelectedAssemblyNumber("");


    setSelectedStateFeature(
      feature
    );

    setSelectedDistrictFeature(
      null
    );

    setSelectedAssemblyFeature(
      null
    );


    setAssemblyDashboard(
      null
    );

    setDashboardError("");

    setDashboardOpen(
      false
    );


    setMapLevel(
      "state"
    );

  }


  // =======================================================
  // DISTRICT CHANGE
  // =======================================================

  function handleDistrictChange(
    districtName
  ) {

    if (!isUttarPradesh) {
      return;
    }


    const feature =
      districts?.features?.find(
        (item) =>

          String(
            getDistrictName(item)
          )
            .toLowerCase()
            .trim() ===

          String(districtName)
            .toLowerCase()
            .trim()

      );


    if (!feature) {
      return;
    }


    setSelectedDistrict(
      districtName
    );


    setSelectedDistrictCode(
      String(
        getDistrictCode(feature)
      )
    );


    setSelectedAssembly("");
    setSelectedAssemblyNumber("");


    setSelectedDistrictFeature(
      feature
    );

    setSelectedAssemblyFeature(
      null
    );


    setAssemblyDashboard(
      null
    );

    setDashboardOpen(
      false
    );

    setDashboardError("");


    setMapLevel(
      "district"
    );

  }


  // =======================================================
  // ASSEMBLY CHANGE
  // =======================================================

  function handleAssemblyChange(
    assemblyName
  ) {

    if (
      !isUttarPradesh ||
      !selectedDistrictCode
    ) {

      return;

    }


    const feature =
      assemblies?.features?.find(
        (item) => {

          return (

            normalizeCode(
              getAssemblyDistrictCode(
                item
              )
            ) ===

            normalizeCode(
              selectedDistrictCode
            )

            &&

            String(
              getAssemblyName(item)
            )
              .toLowerCase()
              .trim() ===

            String(assemblyName)
              .toLowerCase()
              .trim()

          );

        }
      );


    if (!feature) {
      return;
    }


    const assemblyNumber =
      getAssemblyNumber(
        feature
      );


    setSelectedAssembly(
      assemblyName
    );


    setSelectedAssemblyNumber(
      String(
        assemblyNumber
      )
    );


    setSelectedAssemblyFeature(
      feature
    );


    setMapLevel(
      "assembly"
    );

  }


  // =======================================================
  // MAP CLICKS
  // =======================================================

  function handleStateClick(
    feature
  ) {

    const name =
      getStateName(feature);

    if (name) {

      handleStateChange(
        name
      );

    }

  }


  function handleDistrictClick(
    feature
  ) {

    if (!isUttarPradesh) {
      return;
    }


    const name =
      getDistrictName(
        feature
      );


    if (name) {

      handleDistrictChange(
        name
      );

    }

  }


  function handleAssemblyClick(
    feature
  ) {

    if (!isUttarPradesh) {
      return;
    }


    const name =
      getAssemblyName(
        feature
      );


    if (name) {

      handleAssemblyChange(
        name
      );

    }

  }


  // =======================================================
  // CLOSE DASHBOARD
  // =======================================================

  function closeDashboard() {

    setDashboardOpen(
      false
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

    setSelectedStateFeature(
      null
    );

    setSelectedDistrictFeature(
      null
    );

    setSelectedAssemblyFeature(
      null
    );

    setAssemblyDashboard(
      null
    );

    setDashboardError("");

    setDashboardOpen(
      false
    );

    setMapLevel(
      "india"
    );

  }


  // =======================================================
  // GO BACK
  // =======================================================

  function goBack() {

    if (selectedAssembly) {

      setSelectedAssembly("");
      setSelectedAssemblyNumber("");

      setSelectedAssemblyFeature(
        null
      );

      setAssemblyDashboard(
        null
      );

      setDashboardError("");

      setDashboardOpen(
        false
      );

      setMapLevel(
        "district"
      );

      return;
    }


    if (selectedDistrict) {

      setSelectedDistrict("");
      setSelectedDistrictCode("");

      setSelectedDistrictFeature(
        null
      );

      setSelectedAssembly("");
      setSelectedAssemblyNumber("");

      setSelectedAssemblyFeature(
        null
      );

      setAssemblyDashboard(
        null
      );

      setDashboardError("");

      setDashboardOpen(
        false
      );

      setMapLevel(
        "state"
      );

      return;
    }


    if (selectedState) {

      resetMap();

    }

  }


  // =======================================================
  // LOADING SCREEN
  // =======================================================

  if (loading) {

    return (

      <div className="loading-screen">

        <div className="loading-logo">
          EI
        </div>

        <div className="loader"></div>

        <h2>
          Electoral Intelligence
        </h2>

        <p>
          Initializing GIS layers...
        </p>

      </div>

    );

  }


  // =======================================================
  // CURRENT LEVEL
  // =======================================================

  const currentLevel =
    selectedAssembly
      ? "Assembly"
      : selectedDistrict
      ? "District"
      : selectedState
      ? "State"
      : "India";


  // =======================================================
  // UI
  // =======================================================

  return (

    <div className="app">


      {/* ===================================================
          HEADER
      =================================================== */}

      <header className="header">

        <div className="brand-area">

          <div className="brand-icon">
            EI
          </div>

          <div>

            <div className="brand">
              Electoral Intelligence
            </div>

            <div className="subtitle">
              Geospatial Political Analytics
            </div>

          </div>

        </div>


        <div className="header-right">

          <div className="system-status">

            <span className="status-dot"></span>

            GIS SYSTEM 

          </div>


          <button
            className="reset-button"
            onClick={
              resetMap
            }
          >

            <span>
              ↻
            </span>

            Reset

          </button>

        </div>

      </header>


      {/* ===================================================
          BODY
      =================================================== */}

      <div className="main-layout">


        {/* =================================================
            SIDEBAR
        ================================================= */}

        <aside className="sidebar">

          <div className="sidebar-scroll">


            <div className="explorer-header">

              <div>

                <div className="eyebrow">
                  LOCATION EXPLORER
                </div>

                <h2>
                  Explore Electoral Map
                </h2>

              </div>


              <div className="level-badge">
                {currentLevel}
              </div>

            </div>


            {/* SELECTORS */}

            <div className="selectors">


              {/* STATE */}

              <SearchSelect
                label="State"
                value={
                  selectedState
                }
                options={
                  stateOptions
                }
                placeholder="Select state"
                onChange={
                  handleStateChange
                }
              />


              {/* DISTRICT */}

              <SearchSelect
                label="District"
                value={
                  selectedDistrict
                }
                options={
                  isUttarPradesh
                    ? districtOptions
                    : []
                }
                placeholder={
                  isUttarPradesh
                    ? "Select district"
                    : "Select Uttar Pradesh first"
                }
                disabled={
                  !isUttarPradesh
                }
                onChange={
                  handleDistrictChange
                }
              />


              {/* ASSEMBLY */}

              <SearchSelect
                label="Assembly Constituency"
                value={
                  selectedAssembly
                }
                options={
                  assemblyOptions
                }
                placeholder={
                  selectedDistrict
                    ? "Select assembly"
                    : "Select district first"
                }
                disabled={
                  !selectedDistrict ||
                  !isUttarPradesh
                }
                onChange={
                  handleAssemblyChange
                }
              />

            </div>


            {/* CURRENT PATH */}

            <div className="path-card">

              <div className="path-label">
                CURRENT LOCATION
              </div>


              <div className="path-current">

                {
                  selectedAssembly ||
                  selectedDistrict ||
                  selectedState ||
                  "India"
                }

              </div>


              <div className="path-breadcrumb">

                India

                {selectedState &&
                  ` / ${selectedState}`}

                {selectedDistrict &&
                  ` / ${selectedDistrict}`}

                {selectedAssembly &&
                  ` / ${selectedAssembly}`}

              </div>

            </div>


            {/* BACK */}

            {(selectedState ||
              selectedDistrict ||
              selectedAssembly) && (

              <button
                className="back-button"
                onClick={
                  goBack
                }
              >

                ← Back to previous level

              </button>

            )}


            {/* STATS */}

            <div className="sidebar-section">

              <div className="section-heading">
                DATA OVERVIEW
              </div>


              <div className="stats-grid">


                <div className="stat-card">

                  <span className="stat-icon">
                    ◫
                  </span>

                  <div>

                    <strong>

                      {
                        isUttarPradesh &&
                        selectedState
                          ? districts?.features?.length || 0
                          : "—"
                      }

                    </strong>

                    <small>
                      Districts
                    </small>

                  </div>

                </div>


                <div className="stat-card">

                  <span className="stat-icon">
                    ◈
                  </span>

                  <div>

                    <strong>

                      {
                        isUttarPradesh &&
                        selectedDistrict
                          ? assemblyOptions.length
                          : "—"
                      }

                    </strong>

                    <small>
                      Assemblies
                    </small>

                  </div>

                </div>


              </div>

            </div>


            {/* LEGEND */}

            <div className="sidebar-section">

              <div className="section-heading">
                MAP LEGEND
              </div>


              <div className="legend-list">


                <div className="legend-row">

                  <span className="legend-line state-line"></span>

                  <span>
                    State boundary
                  </span>

                </div>


                <div className="legend-row">

                  <span className="legend-line district-line"></span>

                  <span>
                    District boundary
                  </span>

                </div>


                <div className="legend-row">

                  <span className="legend-line assembly-line"></span>

                  <span>
                    Assembly boundary
                  </span>

                </div>


              </div>

            </div>


            {/* INSTRUCTION */}

            <div className="instruction-card">

              <div className="instruction-icon">
                ✦
              </div>

              <div>

                <strong>
                  Explore the map
                </strong>

                <p>
                  Click a boundary to
                  drill down into the
                  next electoral level.
                </p>

              </div>

            </div>


          </div>

        </aside>


        {/* =================================================
            MAP
        ================================================= */}

        <main className="map-container">


          <MapContainer
            center={[
              22.5,
              79.0,
            ]}
            zoom={5}
            minZoom={4}
            maxZoom={18}
            scrollWheelZoom={true}
            zoomControl={true}
            className="map"
          >


            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />


            {/* =================================================
                STATES
            ================================================= */}

            {states && (

              <GeoJSON
                key="india-states"
                data={
                  states
                }


                style={
                  (feature) => {

                    const selected =
                      normalizeCode(
                        getStateCode(
                          feature
                        )
                      ) ===
                      normalizeCode(
                        selectedStateCode
                      );


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
                          ? "#3b82f6"
                          : "#94a3b8",

                      fillOpacity:
                        selected
                          ? 0.20
                          : 0.04,

                    };

                  }
                }


                onEachFeature={
                  (
                    feature,
                    layer
                  ) => {

                    const name =
                      getStateName(
                        feature
                      );


                    layer.bindTooltip(
                      name ||
                      "State",
                      {
                        sticky: true,
                      }
                    );


                    layer.on({

                      click:
                        () =>
                          handleStateClick(
                            feature
                          ),


                      mouseover:
                        (
                          event
                        ) => {

                          event.target.setStyle({
                            weight: 3,
                            fillOpacity: 0.20,
                          });

                        },


                      mouseout:
                        (
                          event
                        ) => {

                          const selected =
                            normalizeCode(
                              getStateCode(
                                feature
                              )
                            ) ===
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
                                ? 0.20
                                : 0.04,

                          });

                        },

                    });

                  }
                }

              />

            )}


            {/* =================================================
                DISTRICTS
                ONLY FOR UTTAR PRADESH
            ================================================= */}

            {isUttarPradesh &&
              districts && (

                <GeoJSON
                  key={`districts-${selectedStateCode}`}
                  data={
                    districts
                  }


                  style={
                    (feature) => {

                      const selected =
                        normalizeCode(
                          getDistrictCode(
                            feature
                          )
                        ) ===
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
                            : 1.4,

                        fillColor:
                          "#60a5fa",

                        fillOpacity:
                          selected
                            ? 0.28
                            : 0.05,

                      };

                    }
                  }


                  onEachFeature={
                    (
                      feature,
                      layer
                    ) => {

                      const name =
                        getDistrictName(
                          feature
                        );


                      layer.bindTooltip(
                        name ||
                        "District",
                        {
                          sticky: true,
                        }
                      );


                      layer.on({

                        click:
                          () =>
                            handleDistrictClick(
                              feature
                            ),


                        mouseover:
                          (
                            event
                          ) => {

                            event.target.setStyle({
                              weight: 3,
                              fillOpacity: 0.22,
                            });

                          },


                        mouseout:
                          (
                            event
                          ) => {

                            const selected =
                              normalizeCode(
                                getDistrictCode(
                                  feature
                                )
                              ) ===
                              normalizeCode(
                                selectedDistrictCode
                              );


                            event.target.setStyle({

                              weight:
                                selected
                                  ? 3
                                  : 1.4,

                              fillOpacity:
                                selected
                                  ? 0.28
                                  : 0.05,

                            });

                          },

                      });

                    }
                  }

                />

              )}


            {/* =================================================
                ASSEMBLIES
                ONLY FOR SELECTED UP DISTRICT
            ================================================= */}

            {isUttarPradesh &&
              selectedDistrictCode &&
              assemblies && (

                <GeoJSON
                  key={`assemblies-${selectedDistrictCode}`}
                  data={
                    assemblies
                  }


                  filter={
                    (feature) => {

                      return (

                        normalizeCode(
                          getAssemblyDistrictCode(
                            feature
                          )
                        ) ===

                        normalizeCode(
                          selectedDistrictCode
                        )

                      );

                    }
                  }


                  style={
                    (feature) => {

                      const acNo =
                        getAssemblyNumber(
                          feature
                        );


                      const selected =
                        normalizeCode(
                          acNo
                        ) ===
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
                            : 1.4,

                        fillColor:
                          color,

                        fillOpacity:
                          selected
                            ? 0.48
                            : 0.20,

                      };

                    }
                  }


                  onEachFeature={
                    (
                      feature,
                      layer
                    ) => {

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
                            ? ` • AC ${acNo}`
                            : ""
                        }`,
                        {
                          sticky: true,
                        }
                      );


                      layer.on({

                        click:
                          () =>
                            handleAssemblyClick(
                              feature
                            ),


                        mouseover:
                          (
                            event
                          ) => {

                            event.target.setStyle({
                              weight: 3,
                              fillOpacity: 0.45,
                            });

                          },


                        mouseout:
                          (
                            event
                          ) => {

                            const selected =
                              normalizeCode(
                                acNo
                              ) ===
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
                                  : 1.4,

                              fillOpacity:
                                selected
                                  ? 0.48
                                  : 0.20,

                            });

                          },

                      });

                    }
                  }

                />

              )}


            {/* =================================================
                AUTO ZOOM
            ================================================= */}

            <MapController
              selectedFeature={
                selectedAssemblyFeature ||
                selectedDistrictFeature ||
                selectedStateFeature
              }

              level={
                mapLevel
              }

              dashboardOpen={
                dashboardOpen
              }

            />

          </MapContainer>


          {/* =================================================
              MAP TOP BAR
          ================================================= */}

          <div className="map-topbar">

            <div className="map-location">

              <span className="map-pin">
                ◉
              </span>

              <div>

                <small>
                  CURRENT VIEW
                </small>

                <strong>
                  {currentLevel}
                </strong>

              </div>

            </div>


            <div className="map-breadcrumb">

              India

              {selectedState &&
                ` / ${selectedState}`}

              {selectedDistrict &&
                ` / ${selectedDistrict}`}

              {selectedAssembly &&
                ` / ${selectedAssembly}`}

            </div>

          </div>


          {/* =================================================
              ASSEMBLY DASHBOARD
          ================================================= */}

          {dashboardOpen && (

            <AssemblyDashboard

              data={
                assemblyDashboard
              }

              loading={
                dashboardLoading
              }

              error={
                dashboardError
              }

              onClose={
                closeDashboard
              }

            />

          )}


        </main>

      </div>

    </div>

  );
}