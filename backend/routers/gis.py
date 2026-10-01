from fastapi import APIRouter, HTTPException

from services.geojson_service import (
    get_states,
    get_up_districts,
    get_up_assemblies,
    get_up_villages,
    get_up_booths,

    get_assemblies_by_district,
    get_villages_by_assembly,
    get_booths_by_village,
    get_booth_locations
)


router = APIRouter()


# =========================================================
# STATES
# =========================================================

@router.get("/states")
def states():

    try:

        return get_states()

    except FileNotFoundError as e:

        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Failed to load states: {str(e)}"
        )


# =========================================================
# UP DISTRICTS
# =========================================================

@router.get("/districts/uttar-pradesh")
def up_districts():

    try:

        return get_up_districts()

    except FileNotFoundError as e:

        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Failed to load UP districts: {str(e)}"
        )


# =========================================================
# ALL UP ASSEMBLIES
# =========================================================

@router.get("/assemblies/uttar-pradesh")
def up_assemblies():

    try:

        return get_up_assemblies()

    except FileNotFoundError as e:

        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Failed to load UP assemblies: {str(e)}"
        )


# =========================================================
# ASSEMBLIES BY DISTRICT
#
# Example:
# /assemblies?district=Baghpat
# =========================================================

@router.get("/assemblies")
def assemblies_by_district(
    district: str
):

    try:

        return get_assemblies_by_district(
            district
        )

    except FileNotFoundError as e:

        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to load assemblies "
                f"for district {district}: {str(e)}"
            )
        )


# =========================================================
# ALL UP VILLAGES
# =========================================================

@router.get("/villages/uttar-pradesh")
def up_villages():

    try:

        return get_up_villages()

    except FileNotFoundError as e:

        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Failed to load UP villages: {str(e)}"
        )


# =========================================================
# VILLAGES BY ASSEMBLY
#
# Example:
# /villages?assembly=52
# =========================================================

@router.get("/villages")
def villages_by_assembly(
    assembly: str
):

    try:

        return get_villages_by_assembly(
            assembly
        )

    except FileNotFoundError as e:

        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to load villages "
                f"for assembly {assembly}: {str(e)}"
            )
        )


# =========================================================
# ALL UP BOOTHS
# =========================================================

@router.get("/booths/uttar-pradesh")
def up_booths():

    try:

        return get_up_booths()

    except FileNotFoundError as e:

        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Failed to load UP booths: {str(e)}"
        )


# =========================================================
# BOOTHS BY VILLAGE
#
# Example:
# /booths?village=Jain%20Inter%20College
# =========================================================

@router.get("/booths")
def booths_by_village(
    village: str
):

    try:

        return get_booths_by_village(
            village
        )

    except FileNotFoundError as e:

        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to load booths "
                f"for village {village}: {str(e)}"
            )
        )


# =========================================================
# GROUPED BOOTH LOCATIONS
#
# Same coordinates = ONE MAP MARKER
#
# Example:
# /booth-locations?village=XYZ
# =========================================================

@router.get("/booth-locations")
def booth_locations(
    village: str = None
):

    try:

        return get_booth_locations(
            village
        )

    except FileNotFoundError as e:

        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to load booth locations: "
                f"{str(e)}"
            )
        )