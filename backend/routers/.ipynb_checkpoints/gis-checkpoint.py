from fastapi import APIRouter, HTTPException

from services.geojson_service import (
    get_states,
    get_up_districts,
    get_up_assemblies,
    get_assemblies_by_district,
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
#
# /assemblies?district=Baghpat
#
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