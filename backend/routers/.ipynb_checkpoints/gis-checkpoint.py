from fastapi import APIRouter, HTTPException

from services.geojson_service import (
    get_states,
    get_up_districts,
    get_up_assemblies,
    get_assemblies_by_district,
    get_assembly_dashboard,
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


# =========================================================
# ASSEMBLY DASHBOARD
#
# Example:
#
# /assembly-dashboard/50
#
# AC_NO is used as the connection key between:
#
# Assembly GeoJSON
#        ↓
#      AC_NO
#        ↓
# Excel Assembly Data
#        ↓
# Assembly Dashboard
#
# =========================================================

@router.get("/assembly-dashboard/{ac_no}")
def assembly_dashboard(
    ac_no: str
):

    try:

        data = get_assembly_dashboard(
            ac_no
        )

        # -------------------------------------------------
        # Assembly not found in Excel
        # -------------------------------------------------

        if data is None:

            raise HTTPException(
                status_code=404,
                detail=(
                    "Assembly dashboard data not found "
                    f"for AC_NO: {ac_no}"
                )
            )

        return data

    except HTTPException:

        raise

    except FileNotFoundError as e:

        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except ValueError as e:

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to load assembly dashboard "
                f"for AC_NO {ac_no}: {str(e)}"
            )
        )