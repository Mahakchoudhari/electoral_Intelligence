import geopandas as gpd
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

        print("✅ GeoDataFrame loaded")
        print("Features:", len(gdf))
        print("Columns:", list(gdf.columns))
        print("CRS:", gdf.crs)

        # -------------------------------------------------
        # EMPTY CHECK
        # -------------------------------------------------

        if gdf.empty:

            print(
                "⚠ WARNING: GeoDataFrame is empty"
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
                "✅ Missing CRS assumed as EPSG:4326"
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
                        "✅ Converted CRS to EPSG:4326"
                    )

            except Exception as crs_error:

                print(
                    "⚠ CRS check warning:",
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
                            "✅ Geometry repair completed"
                        )

                    except Exception as repair_error:

                        print(
                            "⚠ Geometry repair failed:",
                            repair_error
                        )

            except Exception as geometry_error:

                print(
                    "⚠ Geometry validation warning:",
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
            "✅ GeoJSON prepared"
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
            "❌ Error reading GIS data:",
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
# Example:
# 052  -> 52
# AC52 -> 52
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
            int(value)
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