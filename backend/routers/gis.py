from fastapi import APIRouter, HTTPException

from services.geojson_service import (
    get_states,
    get_up_districts,
    get_up_assemblies,
    get_up_villages,
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
# UP ASSEMBLIES
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
# UP VILLAGES
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