import { useEffect, useMemo, useState } from "react";

import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Tooltip,
  Popup,
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
// NORMALIZE
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
      "STATE"
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
      "state_code"
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
      "district_name"
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
      "district_code"
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
      "assembly_name"
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
      "assembly_number"
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
      "district_code"
    ]
  );
}


// =========================================================
// VILLAGE
// =========================================================

function getVillageName(feature) {

  return getProperty(
    feature?.properties,
    [
      "vilname11",
      "vilnam_soi",
      "search_village",
      "VILNAME11",
      "VIL_NAME",
      "village_name",
      "village",
      "Village",
      "Village_Name"
    ]
  );
}


function getVillageDistrictCode(feature) {

  return getProperty(
    feature?.properties,
    [
      "dtcode11",
      "DT_CODE",
      "dist_lgd",
      "Dist_LGD",
      "district_code"
    ]
  );
}


function getVillageAssemblyNumber(feature) {

  return getProperty(
    feature?.properties,
    [
      "ac_no",
      "AC_NO",
      "acno",
      "ACNO",
      "assembly_no",
      "assembly_number"
    ]
  );
}


// =========================================================
// BOOTH PROPERTY HELPERS
// =========================================================

function getBoothNumber(booth) {

  return (
    booth?.booth_no ??
    getProperty(
      booth?.properties,
      [
        "booth_no",
        "booth_number",
        "booth",
        "part_no",
        "part_number",
        "Booth_No",
        "PART_NO"
      ]
    )
  );
}


function getBoothName(booth) {

  return (
    booth?.booth_name ??
    getProperty(
      booth?.properties,
      [
        "booth_name",
        "polling_station",
        "polling_station_name",
        "location",
        "booth_location",
        "Booth_Name",
        "PS_NAME"
      ]
    )
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
      search
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

                      onChange(option);

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
  level
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

        if (level === "village") {
          maxZoom = 16;
        }


        map.flyToBounds(
          bounds,
          {
            paddingTopLeft: [
              40,
              40
            ],

            paddingBottomRight: [
              420,
              40
            ],

            duration: 1.15,

            easeLinearity: 0.2,

            maxZoom
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
    map
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
  "#0284c7"
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
// VILLAGE COLORS
// =========================================================

function getVillageColor(
  feature,
  index
) {

  const name =
    getVillageName(feature) ||
    "";

  let hash = 0;

  for (
    let i = 0;
    i < name.length;
    i++
  ) {

    hash =
      name.charCodeAt(i) +
      ((hash << 5) - hash);

  }

  return ASSEMBLY_COLORS[
    Math.abs(hash + index) %
    ASSEMBLY_COLORS.length
  ];
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

  const [villages, setVillages] =
    useState(null);

  const [boothLocations, setBoothLocations] =
    useState([]);


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

  const [selectedVillage, setSelectedVillage] =
    useState("");


  // =======================================================
  // FEATURES
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
  // BOOTH UI
  // =======================================================

  const [selectedLocation, setSelectedLocation] =
    useState(null);

  const [selectedBooth, setSelectedBooth] =
    useState(null);

  const [boothAnalysis, setBoothAnalysis] =
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

  const [boothLoading, setBoothLoading] =
    useState(false);


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
          villageResponse
        ] =
          await Promise.all([

            fetch(
              `${API}/districts/uttar-pradesh`
            ),

            fetch(
              `${API}/assemblies/uttar-pradesh`
            ),

            fetch(
              `${API}/villages/uttar-pradesh`
            )

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


        setDistricts(
          districtData
        );

        setAssemblies(
          assemblyData
        );

        setVillages(
          villageData
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
  // STATE OPTIONS
  // =======================================================

  const stateOptions =
    useMemo(() => {

      if (!states?.features) {
        return [];
      }

      return [
        ...new Set(
          states.features
            .map(getStateName)
            .filter(Boolean)
        )
      ].sort();

    }, [states]);


  // =======================================================
  // DISTRICT OPTIONS
  // =======================================================

  const districtOptions =
    useMemo(() => {

      if (!districts?.features) {
        return [];
      }

      return [
        ...new Set(
          districts.features
            .map(getDistrictName)
            .filter(Boolean)
        )
      ].sort();

    }, [districts]);


  // =======================================================
  // ASSEMBLY OPTIONS
  // =======================================================

  const assemblyOptions =
    useMemo(() => {

      if (
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
                name
              ];

            }
          )

        ).values()

      ]
        .filter(Boolean)
        .sort();

    }, [
      assemblies,
      selectedDistrictCode
    ]);


  // =======================================================
  // VISIBLE VILLAGES
  // =======================================================

  const visibleVillages =
    useMemo(() => {

      if (
        !villages?.features ||
        !selectedDistrictCode ||
        !selectedAssemblyNumber
      ) {
        return [];
      }


      return villages.features.filter(
        (feature) => {

          return (

            normalizeCode(
              getVillageDistrictCode(
                feature
              )
            ) ===
            normalizeCode(
              selectedDistrictCode
            )

            &&

            normalizeCode(
              getVillageAssemblyNumber(
                feature
              )
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
      selectedAssemblyNumber
    ]);


  // =======================================================
  // VILLAGE OPTIONS
  // =======================================================

  const villageOptions =
    useMemo(() => {

      return [
        ...new Set(
          visibleVillages
            .map(getVillageName)
            .filter(Boolean)
        )
      ].sort();

    }, [visibleVillages]);


  // =======================================================
  // LOAD BOOTHS
  // =======================================================

  async function loadBooths(
    villageName
  ) {

    try {

      setBoothLoading(true);

      setSelectedLocation(null);
      setSelectedBooth(null);
      setBoothAnalysis(null);


      const response =
        await fetch(
          `${API}/booth-locations?village=${encodeURIComponent(
            villageName
          )}`
        );


      if (!response.ok) {
        throw new Error(
          "Failed to load booth locations"
        );
      }


      const data =
        await response.json();


      setBoothLocations(
        data?.locations || []
      );

    } catch (error) {

      console.error(
        "Booth loading error:",
        error
      );

      setBoothLocations([]);

    } finally {

      setBoothLoading(false);

    }

  }


  // =======================================================
  // LOAD BOOTH ANALYSIS
  // =======================================================

  async function loadBoothAnalysis(
    booth
  ) {

    setSelectedBooth(
      booth
    );

    setBoothAnalysis(null);


    const boothNo =
      getBoothNumber(
        booth
      );


    if (!boothNo) {
      return;
    }


    try {

      const response =
        await fetch(
          `${API}/booth/${encodeURIComponent(
            boothNo
          )}/analysis`
        );


      if (
        response.ok
      ) {

        const data =
          await response.json();

        setBoothAnalysis(
          data
        );

      }

    } catch (error) {

      console.log(
        "Booth analysis endpoint not available yet."
      );

    }

  }


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


    if (!feature) return;


    setSelectedState(
      stateName
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

    setSelectedVillage("");


    setSelectedStateFeature(
      feature
    );

    setSelectedDistrictFeature(
      null
    );

    setSelectedAssemblyFeature(
      null
    );

    setSelectedVillageFeature(
      null
    );


    setBoothLocations([]);

    setSelectedLocation(null);
    setSelectedBooth(null);
    setBoothAnalysis(null);


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


    if (!feature) return;


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

    setSelectedVillage("");


    setSelectedAssemblyFeature(
      null
    );

    setSelectedVillageFeature(
      null
    );


    setSelectedDistrictFeature(
      feature
    );


    setBoothLocations([]);
    setSelectedLocation(null);
    setSelectedBooth(null);
    setBoothAnalysis(null);


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


    if (!feature) return;


    const assemblyNumber =
      getAssemblyNumber(
        feature
      );


    setSelectedAssembly(
      assemblyName
    );

    setSelectedAssemblyNumber(
      String(assemblyNumber)
    );

    setSelectedVillage("");


    setSelectedAssemblyFeature(
      feature
    );

    setSelectedVillageFeature(
      null
    );


    setBoothLocations([]);
    setSelectedLocation(null);
    setSelectedBooth(null);
    setBoothAnalysis(null);


    setMapLevel(
      "assembly"
    );

  }


  // =======================================================
  // VILLAGE CHANGE
  // =======================================================

  async function handleVillageChange(
    villageName
  ) {

    const feature =
      visibleVillages.find(
        (item) =>
          String(
            getVillageName(item)
          )
            .toLowerCase()
            .trim() ===
          String(villageName)
            .toLowerCase()
            .trim()
      );


    if (!feature) return;


    setSelectedVillage(
      villageName
    );


    setSelectedVillageFeature(
      feature
    );


    setMapLevel(
      "village"
    );


    await loadBooths(
      villageName
    );

  }


  // =======================================================
  // MAP CLICKS
  // =======================================================

  function handleStateClick(
    feature
  ) {

    const name =
      getStateName(
        feature
      );

    if (name) {
      handleStateChange(
        name
      );
    }

  }


  function handleDistrictClick(
    feature
  ) {

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


  function handleVillageClick(
    feature
  ) {

    const name =
      getVillageName(
        feature
      );

    if (name) {
      handleVillageChange(
        name
      );
    }

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

    setBoothLocations([]);
    setSelectedLocation(null);
    setSelectedBooth(null);
    setBoothAnalysis(null);

    setMapLevel(
      "india"
    );

  }


  // =======================================================
  // GO BACK ONE LEVEL
  // =======================================================

  function goBack() {

    if (selectedVillage) {

      setSelectedVillage("");
      setSelectedVillageFeature(null);

      setBoothLocations([]);
      setSelectedLocation(null);
      setSelectedBooth(null);

      setMapLevel(
        "assembly"
      );

      return;
    }


    if (selectedAssembly) {

      setSelectedAssembly("");
      setSelectedAssemblyNumber("");

      setSelectedAssemblyFeature(null);

      setSelectedVillage("");

      setMapLevel(
        "district"
      );

      return;
    }


    if (selectedDistrict) {

      setSelectedDistrict("");
      setSelectedDistrictCode("");

      setSelectedDistrictFeature(null);

      setSelectedAssembly("");
      setSelectedAssemblyNumber("");

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
    selectedVillage
      ? "Village"
      : selectedAssembly
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

            GIS SYSTEM ONLINE

          </div>


          <button
            className="reset-button"
            onClick={resetMap}
          >
            <span>↻</span>
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


            {/* LOCATION HEADER */}

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

              <SearchSelect
                label="State"
                value={selectedState}
                options={stateOptions}
                placeholder="Select state"
                onChange={
                  handleStateChange
                }
              />


              <SearchSelect
                label="District"
                value={selectedDistrict}
                options={
                  selectedState
                    ? districtOptions
                    : []
                }
                placeholder={
                  selectedState
                    ? "Select district"
                    : "Select state first"
                }
                disabled={
                  !selectedState
                }
                onChange={
                  handleDistrictChange
                }
              />


              <SearchSelect
                label="Assembly Constituency"
                value={selectedAssembly}
                options={
                  assemblyOptions
                }
                placeholder={
                  selectedDistrict
                    ? "Select assembly"
                    : "Select district first"
                }
                disabled={
                  !selectedDistrict
                }
                onChange={
                  handleAssemblyChange
                }
              />


              <SearchSelect
                label="Village"
                value={selectedVillage}
                options={
                  villageOptions
                }
                placeholder={
                  selectedAssembly
                    ? villageOptions.length
                      ? "Select village"
                      : "No villages found"
                    : "Select assembly first"
                }
                disabled={
                  !selectedAssembly ||
                  villageOptions.length === 0
                }
                onChange={
                  handleVillageChange
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
                  selectedVillage ||
                  selectedAssembly ||
                  selectedDistrict ||
                  selectedState ||
                  "India"
                }

              </div>

              <div className="path-breadcrumb">

                India

                {selectedState &&
                  `  /  ${selectedState}`}

                {selectedDistrict &&
                  `  /  ${selectedDistrict}`}

                {selectedAssembly &&
                  `  /  ${selectedAssembly}`}

                {selectedVillage &&
                  `  /  ${selectedVillage}`}

              </div>

            </div>


            {/* BACK */}

            {(selectedState ||
              selectedDistrict ||
              selectedAssembly ||
              selectedVillage) && (

              <button
                className="back-button"
                onClick={goBack}
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


                <div className="stat-card">

                  <span className="stat-icon">
                    ⌖
                  </span>

                  <div>

                    <strong>
                      {
                        selectedAssembly
                          ? visibleVillages.length
                          : "—"
                      }
                    </strong>

                    <small>
                      Villages
                    </small>

                  </div>

                </div>


                <div className="stat-card">

                  <span className="stat-icon">
                    ●
                  </span>

                  <div>

                    <strong>
                      {
                        selectedVillage
                          ? boothLocations.length
                          : "—"
                      }
                    </strong>

                    <small>
                      Locations
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


                <div className="legend-row">

                  <span className="legend-fill village-fill"></span>

                  <span>
                    Village boundary
                  </span>

                </div>


                <div className="legend-row">

                  <span className="legend-marker"></span>

                  <span>
                    Booth location
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
            MAP AREA
        ================================================= */}

        <main className="map-container">


          <MapContainer
            center={[
              22.5,
              79.0
            ]}
            zoom={5}
            minZoom={4}
            maxZoom={18}
            scrollWheelZoom={true}
            zoomControl={true}
            className="map"
          >


            {/* BASE MAP */}

            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />


            {/* =================================================
                STATE
            ================================================= */}

            {states && (

              <GeoJSON
                key="india-states"
                data={states}

                style={(feature) => {

                  const selected =
                    normalizeCode(
                      getStateCode(feature)
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
                        : 0.04

                  };

                }}

                onEachFeature={(
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
                      sticky: true
                    }
                  );


                  layer.on({

                    click: () =>
                      handleStateClick(
                        feature
                      ),

                    mouseover: (event) => {

                      event.target.setStyle({
                        weight: 3,
                        fillOpacity: 0.20
                      });

                    },

                    mouseout: (event) => {

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
                            : 0.04

                      });

                    }

                  });

                }}

              />

            )}


            {/* =================================================
                DISTRICTS
            ================================================= */}

            {selectedState &&
              districts && (

              <GeoJSON
                key="districts"
                data={districts}

                style={(feature) => {

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
                        : 0.05

                  };

                }}

                onEachFeature={(
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
                      sticky: true
                    }
                  );


                  layer.on({

                    click: () =>
                      handleDistrictClick(
                        feature
                      ),

                    mouseover: (event) => {

                      event.target.setStyle({
                        weight: 3,
                        fillOpacity: 0.22
                      });

                    },

                    mouseout: (event) => {

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
                            : 0.05

                      });

                    }

                  });

                }}

              />

            )}


            {/* =================================================
                ASSEMBLIES
            ================================================= */}

            {selectedDistrictCode &&
              assemblies && (

              <GeoJSON
                key={`assemblies-${selectedDistrictCode}`}
                data={assemblies}

                filter={(feature) => {

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

                }}

                style={(feature) => {

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
                        : 0.20

                  };

                }}

                onEachFeature={(
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
                      sticky: true
                    }
                  );


                  layer.on({

                    click: () =>
                      handleAssemblyClick(
                        feature
                      ),

                    mouseover: (event) => {

                      event.target.setStyle({
                        weight: 3,
                        fillOpacity: 0.45
                      });

                    },

                    mouseout: (event) => {

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
                            : 0.20

                      });

                    }

                  });

                }}

              />

            )}


            {/* =================================================
                VILLAGES
            ================================================= */}

            {selectedAssemblyNumber &&
              visibleVillages.length > 0 && (

              <GeoJSON
                key={`villages-${selectedAssemblyNumber}-${selectedVillage}`}
                data={{
                  type: "FeatureCollection",
                  features:
                    visibleVillages
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
                        ? 0.42
                        : 0.10

                  };

                }}

                onEachFeature={(
                  feature,
                  layer
                ) => {

                  const name =
                    getVillageName(
                      feature
                    );


                  layer.bindTooltip(
                    name ||
                    "Village",
                    {
                      sticky: true
                    }
                  );


                  layer.on({

                    click: () =>
                      handleVillageClick(
                        feature
                      ),

                    mouseover: (event) => {

                      event.target.setStyle({
                        weight: 3,
                        fillOpacity: 0.30
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

                        weight:
                          selected
                            ? 3
                            : 1,

                        fillOpacity:
                          selected
                            ? 0.42
                            : 0.10

                      });

                    }

                  });

                }}

              />

            )}


            {/* =================================================
                BOOTH HOTSPOTS
            ================================================= */}

            {boothLocations.map(
              (location, index) => {

                const isSelected =
                  selectedLocation ===
                  location;


                return (

                  <CircleMarker
                    key={`${location.latitude}-${location.longitude}-${index}`}
                    center={[
                      location.latitude,
                      location.longitude
                    ]}
                    radius={
                      isSelected
                        ? 12
                        : 8
                    }

                    pathOptions={{

                      color:
                        "#ffffff",

                      weight: 3,

                      fillColor:
                        "#ef4444",

                      fillOpacity:
                        0.95

                    }}

                    eventHandlers={{

                      click: () => {

                        setSelectedLocation(
                          location
                        );

                        setSelectedBooth(
                          null
                        );

                        setBoothAnalysis(
                          null
                        );

                      }

                    }}

                  >

                    <Tooltip
                      direction="top"
                      offset={[
                        0,
                        -8
                      ]}
                    >

                      <strong>
                        {location.booths?.[0]
                          ? getBoothName(
                              location.booths[0]
                            )
                          : "Booth Location"}
                      </strong>

                      <br />

                      {location.booth_count}
                      {" "}
                      booth
                      {location.booth_count !== 1
                        ? "s"
                        : ""}

                    </Tooltip>

                    <Popup>

                      <div className="map-popup">

                        <div className="popup-title">
                          {location.booths?.[0]
                            ? getBoothName(
                                location.booths[0]
                              )
                            : "Booth Location"}
                        </div>

                        <div className="popup-count">

                          {location.booth_count}

                          {" "}
                          Booth
                          {location.booth_count !== 1
                            ? "s"
                            : ""}

                        </div>

                        <button
                          className="popup-button"
                          onClick={() =>
                            setSelectedLocation(
                              location
                            )
                          }
                        >
                          View booth details →
                        </button>

                      </div>

                    </Popup>

                  </CircleMarker>

                );

              }
            )}


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

              {selectedVillage &&
                ` / ${selectedVillage}`}

            </div>

          </div>


          {/* =================================================
              BOOTH LOADING
          ================================================= */}

          {boothLoading && (

            <div className="map-loading">

              <div className="mini-spinner"></div>

              Loading booth locations...

            </div>

          )}


          {/* =================================================
              BOOTH LOCATION PANEL
          ================================================= */}

          {selectedLocation && (

            <div className="booth-panel">

              <div className="panel-header">

                <div>

                  <div className="panel-eyebrow">
                    POLLING LOCATION
                  </div>

                  <h3>

                    {
                      selectedLocation.booths?.[0]
                        ? getBoothName(
                            selectedLocation.booths[0]
                          )
                        : "Booth Location"
                    }

                  </h3>

                </div>


                <button
                  className="close-button"
                  onClick={() =>
                    setSelectedLocation(
                      null
                    )
                  }
                >
                  ×
                </button>

              </div>


              <div className="booth-summary">

                <div className="booth-summary-number">
                  {selectedLocation.booth_count}
                </div>

                <div>

                  <strong>
                    Booths at this location
                  </strong>

                  <span>
                    Same physical polling location
                  </span>

                </div>

              </div>


              <div className="booth-list">

                {selectedLocation.booths?.map(
                  (booth, index) => {

                    const boothNo =
                      getBoothNumber(
                        booth
                      );

                    const boothName =
                      getBoothName(
                        booth
                      );


                    const selected =
                      selectedBooth ===
                      booth;


                    return (

                      <button
                        key={
                          `${boothNo}-${index}`
                        }
                        className={`booth-row ${
                          selected
                            ? "selected-booth"
                            : ""
                        }`}
                        onClick={() =>
                          loadBoothAnalysis(
                            booth
                          )
                        }
                      >

                        <span className="booth-number">
                          {boothNo ||
                            index + 1}
                        </span>

                        <span className="booth-info">

                          <strong>
                            Booth{" "}
                            {boothNo ||
                              index + 1}
                          </strong>

                          <small>
                            {boothName ||
                              "Polling station"}
                          </small>

                        </span>

                        <span className="booth-arrow">
                          →
                        </span>

                      </button>

                    );

                  }
                )}

              </div>


              {/* =============================================
                  BOOTH ANALYSIS
              ============================================= */}

              {selectedBooth && (

                <div className="analysis-panel">

                  <div className="analysis-header">

                    <div>

                      <span>
                        BOOTH ANALYSIS
                      </span>

                      <h3>
                        Booth{" "}
                        {getBoothNumber(
                          selectedBooth
                        )}
                      </h3>

                    </div>

                    <div className="analysis-status">
                      LIVE
                    </div>

                  </div>


                  {boothAnalysis ? (

                    <>

                      <div className="analysis-location">

                        <strong>
                          {
                            getBoothName(
                              selectedBooth
                            )
                          }
                        </strong>

                        <span>
                          {selectedVillage}
                          {" • "}
                          AC{" "}
                          {selectedAssemblyNumber}
                        </span>

                      </div>


                      <div className="analysis-grid">

                        <div className="metric-card">

                          <span>
                            TOTAL VOTES
                          </span>

                          <strong>
                            {
                              boothAnalysis.total_votes ??
                              "—"
                            }
                          </strong>

                        </div>


                        <div className="metric-card">

                          <span>
                            VOTE SHARE
                          </span>

                          <strong>
                            {
                              boothAnalysis.vote_share != null
                                ? `${boothAnalysis.vote_share}%`
                                : "—"
                            }
                          </strong>

                        </div>


                        <div className="metric-card">

                          <span>
                            PREVIOUS VOTES
                          </span>

                          <strong>
                            {
                              boothAnalysis.previous_total_votes ??
                              "—"
                            }
                          </strong>

                        </div>


                        <div className="metric-card">

                          <span>
                            PREVIOUS SHARE
                          </span>

                          <strong>
                            {
                              boothAnalysis.previous_vote_share != null
                                ? `${boothAnalysis.previous_vote_share}%`
                                : "—"
                            }
                          </strong>

                        </div>

                      </div>


                      <div className="analysis-section">

                        <div className="analysis-section-title">
                          PARTY-WISE VOTE SHARE
                        </div>

                        {boothAnalysis.parties?.map(
                          (party, index) => (

                            <div
                              className="party-row"
                              key={index}
                            >

                              <span>
                                {party.party}
                              </span>

                              <div className="party-bar">

                                <div
                                  style={{
                                    width: `${party.vote_share || 0}%`
                                  }}
                                />

                              </div>

                              <strong>
                                {party.vote_share}%
                              </strong>

                            </div>

                          )
                        )}

                      </div>

                    </>

                  ) : (

                    <div className="analysis-placeholder">

                      <div className="placeholder-icon">
                        ◌
                      </div>

                      <strong>
                        Booth selected
                      </strong>

                      <p>
                        Connect the booth analysis
                        endpoint to display vote
                        share and previous-year
                        electoral data.
                      </p>

                    </div>

                  )}

                </div>

              )}

            </div>

          )}

        </main>

      </div>

    </div>

  );
}