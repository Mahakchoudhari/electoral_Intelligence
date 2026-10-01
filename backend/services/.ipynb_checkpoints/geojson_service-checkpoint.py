import geopandas as gpd
from pathlib import Path


# =========================================================
# BASE DIRECTORIES
# =========================================================

BASE_DIR = Path(__file__).resolve().parent.parent

INDIA_DIR = BASE_DIR / "INDIA"
UP_DIR = BASE_DIR / "UTTAR PRADESH"


# =========================================================
# GENERIC GEOJSON LOADER
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

        print("FILE NOT FOUND")
        print("Expected path:", path)

        raise FileNotFoundError(
            f"GeoJSON file not found: {path}"
        )

    # -----------------------------------------------------
    # READ GEOJSON
    # -----------------------------------------------------

    try:

        gdf = gpd.read_file(path)

        print("GeoDataFrame loaded successfully")
        print("Features:", len(gdf))
        print("Columns:", list(gdf.columns))
        print("CRS:", gdf.crs)

        # -------------------------------------------------
        # EMPTY CHECK
        # -------------------------------------------------

        if gdf.empty:

            print("WARNING: GeoDataFrame is empty")

        # -------------------------------------------------
        # GEOMETRY CHECK
        # -------------------------------------------------

        if "geometry" in gdf.columns:

            print(
                "Empty geometries:",
                gdf.geometry.is_empty.sum()
            )

            print(
                "Null geometries:",
                gdf.geometry.isna().sum()
            )

        # -------------------------------------------------
        # ENSURE WGS84
        # Leaflet expects latitude/longitude
        # -------------------------------------------------

        if gdf.crs is not None:

            try:

                if gdf.crs.to_epsg() != 4326:

                    gdf = gdf.to_crs(epsg=4326)

                    print(
                        "Converted CRS to EPSG:4326"
                    )

            except Exception:

                pass

        # -------------------------------------------------
        # RETURN GEOJSON
        # -------------------------------------------------

        geojson_data = gdf.__geo_interface__

        print(
            "GeoJSON response prepared successfully"
        )

        return geojson_data

    except Exception as e:

        print(
            "Error reading GIS data:",
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
        "UP_SELECTED_16_DISTRICTS.geojson"
    )


# =========================================================
# UP ASSEMBLIES
# =========================================================

def get_up_assemblies():

    return load_geojson(
        UP_DIR /
        "UP_SELECTED_ASSEMBLY.geojson"
    )


# =========================================================
# UP VILLAGES
# =========================================================

def get_up_villages():

    return load_geojson(
        UP_DIR /
        "UTTAR PRADESH_VILLAGES.geojson"
    )


# =========================================================
# UP BOOTHS
# =========================================================

def get_up_booths():

    return load_geojson(
        UP_DIR /
        "UTTAR PRADESH_baghpat_booth.geojson"
    )


# =========================================================
# PROPERTY FINDER
#
# Different GeoJSON files may have different
# column/property names.
# =========================================================

def find_property(properties, possible_names):

    # Create case-insensitive mapping

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
            normalize_value(actual_value)
            ==
            normalize_value(value)
        ):

            matched.append(feature)

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
            "DistrictName"
        ],

        district_name
    )


# =========================================================
# VILLAGES BY ASSEMBLY
# =========================================================

def get_villages_by_assembly(
    assembly_name
):

    data = get_up_villages()

    return filter_features(
        data,

        [
            "assembly",
            "assembly_name",
            "assemblyname",
            "AC_NAME",
            "ACNAME",
            "AC_NO",
            "AC_NUM",
            "assembly_no",
            "assembly_number",
            "Assembly",
            "Assembly_Name"
        ],

        assembly_name
    )


# =========================================================
# BOOTHS BY VILLAGE
# =========================================================

def get_booths_by_village(
    village_name
):

    data = get_up_booths()

    return filter_features(
        data,

        [
            "village",
            "village_name",
            "villagename",
            "Village",
            "Village_Name",
            "VILLAGE",
            "VILL_NAME"
        ],

        village_name
    )


# =========================================================
# GET ALL BOOTHS AT SAME LOCATION
# =========================================================

def get_booth_locations(
    village_name=None
):

    data = get_up_booths()

    features = data.get(
        "features",
        []
    )

    # -----------------------------------------------------
    # OPTIONAL VILLAGE FILTER
    # -----------------------------------------------------

    if village_name:

        village_features = []

        for feature in features:

            properties = feature.get(
                "properties",
                {}
            )

            village_property = find_property(
                properties,

                [
                    "village",
                    "village_name",
                    "villagename",
                    "Village",
                    "Village_Name",
                    "VILLAGE",
                    "VILL_NAME"
                ]
            )

            if village_property is None:

                continue

            if (
                normalize_value(
                    properties.get(
                        village_property
                    )
                )
                ==
                normalize_value(
                    village_name
                )
            ):

                village_features.append(
                    feature
                )

        features = village_features

    # -----------------------------------------------------
    # GROUP BY COORDINATES
    # -----------------------------------------------------

    locations = {}

    for feature in features:

        geometry = feature.get(
            "geometry"
        )

        if not geometry:

            continue

        coordinates = geometry.get(
            "coordinates"
        )

        if not coordinates:

            continue

        # Point geometry:
        # [longitude, latitude]

        if geometry.get("type") != "Point":

            continue

        longitude = coordinates[0]
        latitude = coordinates[1]

        # Round to avoid tiny floating-point differences

        location_key = (
            round(latitude, 6),
            round(longitude, 6)
        )

        properties = feature.get(
            "properties",
            {}
        )

        booth_no_property = find_property(
            properties,

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

        booth_name_property = find_property(
            properties,

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

        booth = {
            "properties": properties,
            "booth_no": (
                properties.get(
                    booth_no_property
                )
                if booth_no_property
                else None
            ),
            "booth_name": (
                properties.get(
                    booth_name_property
                )
                if booth_name_property
                else None
            ),
            "latitude": latitude,
            "longitude": longitude
        }

        # -------------------------------------------------
        # CREATE LOCATION
        # -------------------------------------------------

        if location_key not in locations:

            locations[location_key] = {
                "latitude": latitude,
                "longitude": longitude,
                "booth_count": 0,
                "booths": []
            }

        locations[location_key][
            "booths"
        ].append(booth)

        locations[location_key][
            "booth_count"
        ] += 1

    return {
        "locations": list(
            locations.values()
        )
    }