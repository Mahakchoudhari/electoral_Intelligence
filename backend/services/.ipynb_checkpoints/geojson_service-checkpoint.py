import geopandas as gpd
from pathlib import Path


# =========================================================
# BASE DIRECTORIES
# =========================================================

BASE_DIR = Path(__file__).resolve().parent.parent

INDIA_DIR = BASE_DIR / "INDIA"

# IMPORTANT:
# Folder name has SPACE, not underscore
UP_DIR = BASE_DIR / "UTTAR PRADESH"


# =========================================================
# LOAD GEOJSON USING GEOPANDAS
# =========================================================

def load_geojson(path: Path):

    print("\n----------------------------------------")
    print("Loading GIS data:")
    print(path)
    print("----------------------------------------")

    # -----------------------------------------------------
    # FILE CHECK
    # -----------------------------------------------------

    if not path.exists():

        print("FILE NOT FOUND ")
        print("Expected path:", path)

        raise FileNotFoundError(
            f"GeoJSON file not found: {path}"
        )

    # -----------------------------------------------------
    # READ GEOJSON USING GEOPANDAS
    # -----------------------------------------------------

    try:

        # GeoJSON → GeoDataFrame
        gdf = gpd.read_file(path)

        print("GeoDataFrame loaded successfully ")

        print("Features:", len(gdf))

        print(
            "Columns:",
            list(gdf.columns)
        )

        print(
            "CRS:",
            gdf.crs
        )

        # -------------------------------------------------
        # CHECK EMPTY DATA
        # -------------------------------------------------

        if gdf.empty:

            print("WARNING: GeoDataFrame is empty ")

        # -------------------------------------------------
        # CHECK GEOMETRY
        # -------------------------------------------------

        if "geometry" in gdf.columns:

            empty_geometry_count = (
                gdf.geometry.is_empty.sum()
            )

            null_geometry_count = (
                gdf.geometry.isna().sum()
            )

            print(
                "Empty geometries:",
                empty_geometry_count
            )

            print(
                "Null geometries:",
                null_geometry_count
            )

        # -------------------------------------------------
        # GEODATAFRAME → GEOJSON
        #
        # React Leaflet still receives the same
        # FeatureCollection structure.
        # -------------------------------------------------

        geojson_data = gdf.__geo_interface__

        print(
            "GeoJSON response prepared successfully "
        )

        return geojson_data

    except Exception as e:

        print(
            "Error reading GIS data :",
            e
        )

        raise


# =========================================================
# INDIA STATES
# =========================================================

def get_states():

    return load_geojson(
        INDIA_DIR /
        "INDIA_STATES.geojson"
    )


# =========================================================
# UP DISTRICTS
# =========================================================

def get_up_districts():

    return load_geojson(
        UP_DIR /
        "UTTAR PRADESH_DISTRICTS.geojson"
    )


# =========================================================
# UP ASSEMBLIES
# =========================================================

def get_up_assemblies():

    return load_geojson(
        UP_DIR /
        "UTTAR PRADESH_ASSEMBLY.geojson"
    )


# =========================================================
# UP VILLAGES
# =========================================================

def get_up_villages():

    return load_geojson(
        UP_DIR /
        "UTTAR PRADESH_VILLAGES.geojson"
    )
