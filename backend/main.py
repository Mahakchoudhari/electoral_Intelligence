from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.gis import router as gis_router


# =========================================================
# FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="Electoral Intelligence GIS API",
    version="1.0.0"
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],
)


# =========================================================
# GIS ROUTER
# =========================================================

app.include_router(
    gis_router,
    prefix="/api/gis",
    tags=["GIS"]
)


# =========================================================
# ROOT
# =========================================================

@app.get("/")
def root():

    return {
        "message": "Electoral Intelligence GIS API is running"
    }