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

const API = "http://127.0.0.1:8000/api/gis";


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


// =========================================================
// MAIN APP
// =========================================================

export default function App() {

  // =======================================================
  // GEOJSON DATA
  // =======================================================

  const [states, setStates] = useState(null);

  const [districts, setDistricts] = useState(null);

  const [assemblies, setAssemblies] = useState(null);

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


  // =======================================================
  // LOAD STATES
  // =======================================================

  useEffect(() => {

    async function loadStates() {

      try {

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

      } finally {

        setLoading(false);

      }
    }

    loadStates();

  }, []);


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
    );

    setSelectedDistrictCode(
      String(districtCode)
    );


    setSelectedAssembly("");

    setSelectedAssemblyNumber("");

    setSelectedVillage("");


    setSelectedAssemblyFeature(null);

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

  }


  // =======================================================
  // ASSEMBLY MAP CLICK
  // =======================================================

  function handleAssemblyClick(feature) {

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


  // =======================================================
  // UI
  // =======================================================

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


          <div className="section-title">
            LOCATION EXPLORER
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
              selectedDistrictCode &&
              assemblies && (

                <GeoJSON

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

        </main>

      </div>

    </div>

  );
}