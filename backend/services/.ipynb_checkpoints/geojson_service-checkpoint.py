import geopandas as gpd
import pandas as pd

from pathlib import Path


# =========================================================
# BASE DIRECTORIES
# =========================================================

BASE_DIR = Path(__file__).resolve().parent.parent

INDIA_DIR = BASE_DIR / "INDIA"
UP_DIR = BASE_DIR / "UTTAR PRADESH"



# =========================================================
# FILE PATHS
# =========================================================

INDIA_STATES_FILE = (
    INDIA_DIR / "INDIA_STATES.geojson"
)

UP_DISTRICTS_FILE = (
    UP_DIR / "UP_SELECTED_16_DISTRICTS.geojson"
)

UP_ASSEMBLIES_FILE = (
    UP_DIR / "UP_SELECTED_ASSEMBLY.geojson"
)

# =========================================================
# VILLAGE HOTSPOTS
# =========================================================

VILLAGES_FILE = (
    UP_DIR / "BAGHPAT_AC52_VILLAGES.geojson"
)

# =========================================================
# ASSEMBLY DASHBOARD EXCEL
# =========================================================

ASSEMBLY_DASHBOARD_FILE = (
    UP_DIR / "Assembly_Dashboard.xlsx"
)


# =========================================================
# GENERIC GEOJSON LOADER
# =========================================================

def load_geojson(path: Path):

    print("\n========================================")
    print("Loading GIS data")
    print("File:", path)
    print("========================================")

    # -----------------------------------------------------
    # FILE CHECK
    # -----------------------------------------------------

    if not path.exists():

        print("❌ FILE NOT FOUND")
        print("Expected path:", path)

        raise FileNotFoundError(
            f"GeoJSON file not found: {path}"
        )

    try:

        # -------------------------------------------------
        # READ FILE
        # -------------------------------------------------

        gdf = gpd.read_file(path)

        print(" GeoDataFrame loaded")
        print("Features:", len(gdf))
        print("Columns:", list(gdf.columns))
        print("CRS:", gdf.crs)

        # -------------------------------------------------
        # EMPTY CHECK
        # -------------------------------------------------

        if gdf.empty:

            print(
                "WARNING: GeoDataFrame is empty"
            )

        # -------------------------------------------------
        # GEOMETRY CHECK
        # -------------------------------------------------

        if "geometry" in gdf.columns:

            print(
                "Empty geometries:",
                int(
                    gdf.geometry.is_empty.sum()
                )
            )

            print(
                "Null geometries:",
                int(
                    gdf.geometry.isna().sum()
                )
            )

        # =================================================
        # CRS HANDLING
        # =================================================

        if gdf.crs is None:

            print("⚠ CRS is missing")

            gdf = gdf.set_crs(
                epsg=4326,
                allow_override=True
            )

            print(
                "Missing CRS assumed as EPSG:4326"
            )

        else:

            try:

                epsg = gdf.crs.to_epsg()

                print(
                    "Detected EPSG:",
                    epsg
                )

                if epsg != 4326:

                    gdf = gdf.to_crs(
                        epsg=4326
                    )

                    print(
                        "Converted CRS to EPSG:4326"
                    )

            except Exception as crs_error:

                print(
                    " CRS check warning:",
                    crs_error
                )

        # =================================================
        # GEOMETRY VALIDATION
        # =================================================

        if "geometry" in gdf.columns:

            try:

                invalid_count = int(
                    (
                        ~gdf.geometry.is_valid
                    ).sum()
                )

                print(
                    "Invalid geometries:",
                    invalid_count
                )

                if invalid_count > 0:

                    print(
                        "Attempting geometry repair..."
                    )

                    try:

                        gdf["geometry"] = (
                            gdf.geometry.make_valid()
                        )

                        print(
                            " Geometry repair completed"
                        )

                    except Exception as repair_error:

                        print(
                            " Geometry repair failed:",
                            repair_error
                        )

            except Exception as geometry_error:

                print(
                    "Geometry validation warning:",
                    geometry_error
                )

        # =================================================
        # REMOVE NULL / EMPTY GEOMETRIES
        # =================================================

        if "geometry" in gdf.columns:

            before_count = len(gdf)

            gdf = gdf[
                gdf.geometry.notna()
                & ~gdf.geometry.is_empty
            ].copy()

            removed = (
                before_count - len(gdf)
            )

            if removed > 0:

                print(
                    "Removed empty/null geometries:",
                    removed
                )

        # =================================================
        # GEOJSON
        # =================================================

        geojson_data = (
            gdf.__geo_interface__
        )

        print(
            " GeoJSON prepared"
        )

        print(
            "GeoJSON features:",
            len(
                geojson_data.get(
                    "features",
                    []
                )
            )
        )

        print(
            "========================================\n"
        )

        return geojson_data

    except Exception as e:

        print(
            " Error reading GIS data:",
            e
        )

        raise


# =========================================================
# INDIA STATES
# =========================================================

def get_states():

    return load_geojson(
        INDIA_STATES_FILE
    )


# =========================================================
# UP DISTRICTS
# =========================================================

def get_up_districts():

    return load_geojson(
        UP_DISTRICTS_FILE
    )


# =========================================================
# UP ASSEMBLIES
# =========================================================

def get_up_assemblies():

    return load_geojson(
        UP_ASSEMBLIES_FILE
    )

# =========================================================
# VILLAGE HOTSPOTS BY ASSEMBLY
# =========================================================

def get_villages_by_assembly(
    ac_no
):

    # -----------------------------------------------------
    # LOAD VILLAGE HOTSPOTS
    # -----------------------------------------------------

    data = load_geojson(
        VILLAGES_FILE
    )

    # -----------------------------------------------------
    # NORMALIZE AC_NO
    # -----------------------------------------------------

    requested_ac_no = normalize_code(
        ac_no
    )

    # -----------------------------------------------------
    # FILTER VILLAGE POINTS
    # -----------------------------------------------------

    features = data.get(
        "features",
        []
    )

    matched = []

    for feature in features:

        properties = feature.get(
            "properties",
            {}
        )

        property_name = find_property(
            properties,
            [
                "AC_NO",
                "ac_no",
                "ACNO",
                "acno"
            ]
        )

        if property_name is None:
            continue

        actual_ac_no = normalize_code(
            properties.get(
                property_name
            )
        )

        if actual_ac_no == requested_ac_no:

            matched.append(
                feature
            )

    # -----------------------------------------------------
    # RETURN ONLY MATCHED VILLAGE HOTSPOTS
    # -----------------------------------------------------

    return {
        "type": "FeatureCollection",
        "features": matched
    }

# =========================================================
# PROPERTY FINDER
# =========================================================

def find_property(
    properties,
    possible_names
):

    if not properties:
        return None

    normalized = {
        str(key).strip().lower(): key
        for key in properties.keys()
    }

    for name in possible_names:

        key = normalized.get(
            str(name).strip().lower()
        )

        if key is not None:

            return key

    return None


# =========================================================
# VALUE NORMALIZER
# =========================================================

def normalize_value(value):

    if value is None:
        return ""

    return str(value).strip().lower()


# =========================================================
# NORMALIZE CODE
#
# Examples:
# 052  -> 52
# AC52 -> 52
# 52.0 -> 52
# =========================================================

def normalize_code(value):

    if value is None:
        return ""

    value = str(value).strip().lower()

    value = value.replace(
        "ac",
        ""
    )

    value = value.replace(
        " ",
        ""
    )

    try:

        return str(
            int(
                float(value)
            )
        )

    except Exception:

        return value


# =========================================================
# FILTER FEATURES
# =========================================================

def filter_features(
    geojson_data,
    possible_property_names,
    value
):

    features = geojson_data.get(
        "features",
        []
    )

    if not features:

        return {
            "type": "FeatureCollection",
            "features": []
        }

    matched = []

    for feature in features:

        properties = feature.get(
            "properties",
            {}
        )

        property_name = find_property(
            properties,
            possible_property_names
        )

        if property_name is None:
            continue

        actual_value = properties.get(
            property_name
        )

        if (
            normalize_value(
                actual_value
            )
            ==
            normalize_value(value)
        ):

            matched.append(
                feature
            )

    return {
        "type": "FeatureCollection",
        "features": matched
    }


# =========================================================
# ASSEMBLIES BY DISTRICT
# =========================================================

def get_assemblies_by_district(
    district_name
):

    data = get_up_assemblies()

    return filter_features(
        data,

        [
            "district",
            "district_name",
            "districtname",
            "DISTRICT",
            "DIST_NAME",
            "District_Name",
            "DistrictName",
            "dtname",
            "DTNAME"
        ],

        district_name
    )


# =========================================================
# LOAD ASSEMBLY DASHBOARD EXCEL
# =========================================================

def load_assembly_dashboard():

    print("\n========================================")
    print("Loading Assembly Dashboard Excel")
    print("File:", ASSEMBLY_DASHBOARD_FILE)
    print("========================================")

    # -----------------------------------------------------
    # FILE CHECK
    # -----------------------------------------------------

    if not ASSEMBLY_DASHBOARD_FILE.exists():

        print(" EXCEL FILE NOT FOUND")
        print(
            "Expected path:",
            ASSEMBLY_DASHBOARD_FILE
        )

        raise FileNotFoundError(
            f"Assembly dashboard Excel not found: "
            f"{ASSEMBLY_DASHBOARD_FILE}"
        )

    try:

        # -------------------------------------------------
        # READ EXCEL
        # -------------------------------------------------

        df = pd.read_excel(
            ASSEMBLY_DASHBOARD_FILE
        )

        print(" Excel loaded")
        print("Rows:", len(df))
        print("Columns:", list(df.columns))

        # -------------------------------------------------
        # REQUIRED COLUMNS
        # -------------------------------------------------

        required_columns = [

            "AC_NO",
            "AC_NAME",
            "DIST_NAME",

            "Booth records",
            "total_votes",

            "bjp_votes",
            "bjp_vote_share",

            "rld_votes",
            "rld_vote_share",

            "bjp_red_booths",
            "bjp_red_percent",

            "bjp_amber_booths",
            "bjp_amber_percent",

            "bjp_yellow_booths",
            "bjp_yellow_percent",

            "bjp_green_booths",
            "bjp_green_percent",

            "rld_red_booths",
            "rld_red_percent",

            "rld_amber_booths",
            "rld_amber_percent",

            "rld_yellow_booths",
            "rld_yellow_percent",

            "rld_green_booths",
            "rld_green_percent"
        ]

        missing_columns = [
            column
            for column in required_columns
            if column not in df.columns
        ]

        if missing_columns:

            raise ValueError(
                "Missing Excel columns: "
                + ", ".join(missing_columns)
            )

        print(
            " All required dashboard columns found"
        )

        return df

    except Exception as e:

        print(
            " Error reading Assembly Dashboard Excel:",
            e
        )

        raise


# =========================================================
# CLEAN EXCEL VALUE
# =========================================================

def clean_excel_value(value):

    # -----------------------------------------------------
    # NaN / None
    # -----------------------------------------------------

    if value is None:

        return None

    try:

        if pd.isna(value):

            return None

    except Exception:

        pass

    # -----------------------------------------------------
    # NumPy / Pandas numeric values
    # -----------------------------------------------------

    try:

        if hasattr(value, "item"):

            value = value.item()

    except Exception:

        pass

    # -----------------------------------------------------
    # Convert 50.0 -> 50
    # -----------------------------------------------------

    if isinstance(
        value,
        float
    ):

        if value.is_integer():

            return int(value)

    return value


# =========================================================
# GET ASSEMBLY DASHBOARD
# =========================================================

def get_assembly_dashboard(
    ac_no
):

    # -----------------------------------------------------
    # LOAD EXCEL
    # -----------------------------------------------------

    df = load_assembly_dashboard()

    # -----------------------------------------------------
    # NORMALIZE REQUESTED AC_NO
    # -----------------------------------------------------

    requested_ac_no = normalize_code(
        ac_no
    )

    # -----------------------------------------------------
    # NORMALIZE EXCEL AC_NO
    # -----------------------------------------------------

    df["_AC_NO_NORMALIZED"] = (
        df["AC_NO"]
        .apply(normalize_code)
    )

    # -----------------------------------------------------
    # FIND MATCH
    # -----------------------------------------------------

    matched = df[
        df["_AC_NO_NORMALIZED"]
        == requested_ac_no
    ]

    if matched.empty:

        return None

    # -----------------------------------------------------
    # FIRST MATCH
    # -----------------------------------------------------

    row = matched.iloc[0]

    # =====================================================
    # 1. ASSEMBLY OVERVIEW
    # =====================================================

    overview = {

        "ac_no": clean_excel_value(
            row["AC_NO"]
        ),

        "ac_name": clean_excel_value(
            row["AC_NAME"]
        ),

        "district_name": clean_excel_value(
            row["DIST_NAME"]
        )
    }

    # =====================================================
    # 2. PARTY BAND SUMMARY
    # =====================================================

    party_band_summary = {

        "BJP": {

            "Red": {

                "booths": clean_excel_value(
                    row["bjp_red_booths"]
                ),

                "percent": clean_excel_value(
                    row["bjp_red_percent"]
                )
            },

            "Amber": {

                "booths": clean_excel_value(
                    row["bjp_amber_booths"]
                ),

                "percent": clean_excel_value(
                    row["bjp_amber_percent"]
                )
            },

            "Yellow": {

                "booths": clean_excel_value(
                    row["bjp_yellow_booths"]
                ),

                "percent": clean_excel_value(
                    row["bjp_yellow_percent"]
                )
            },

            "Green": {

                "booths": clean_excel_value(
                    row["bjp_green_booths"]
                ),

                "percent": clean_excel_value(
                    row["bjp_green_percent"]
                )
            }
        },

        "RLD": {

            "Red": {

                "booths": clean_excel_value(
                    row["rld_red_booths"]
                ),

                "percent": clean_excel_value(
                    row["rld_red_percent"]
                )
            },

            "Amber": {

                "booths": clean_excel_value(
                    row["rld_amber_booths"]
                ),

                "percent": clean_excel_value(
                    row["rld_amber_percent"]
                )
            },

            "Yellow": {

                "booths": clean_excel_value(
                    row["rld_yellow_booths"]
                ),

                "percent": clean_excel_value(
                    row["rld_yellow_percent"]
                )
            },

            "Green": {

                "booths": clean_excel_value(
                    row["rld_green_booths"]
                ),

                "percent": clean_excel_value(
                    row["rld_green_percent"]
                )
            }
        }
    }

    # =====================================================
    # 3. DATA CHECKS
    # =====================================================

    data_checks = {

        "booth_records": clean_excel_value(
            row["Booth records"]
        ),

        "total_votes": clean_excel_value(
            row["total_votes"]
        ),

        "bjp_votes": clean_excel_value(
            row["bjp_votes"]
        ),

        "bjp_vote_share": clean_excel_value(
            row["bjp_vote_share"]
        ),

        "rld_votes": clean_excel_value(
            row["rld_votes"]
        ),

        "rld_vote_share": clean_excel_value(
            row["rld_vote_share"]
        )
    }

    # =====================================================
    # FINAL RESPONSE
    # =====================================================

    return {

        "overview": overview,

        "party_band_summary": (
            party_band_summary
        ),

        "data_checks": data_checks
    }
