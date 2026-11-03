import os
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import router as caller_router


@asynccontextmanager
async def lifespan(application: FastAPI):
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL must be set for the caller service")
    pool_min_size = max(1, int(os.getenv("DB_POOL_MIN_SIZE", "1")))
    pool_max_size = max(pool_min_size, int(os.getenv("DB_POOL_MAX_SIZE", "3")))
    application.state.pool = await asyncpg.create_pool(
        database_url,
        min_size=pool_min_size,
        max_size=pool_max_size,
        statement_cache_size=0,
    )
    try:
        yield
    finally:
        await application.state.pool.close()


app = FastAPI(
    title="Electoral Intelligence Caller Service",
    version="1.0.0",
    description="REST API for caller sign-in, call capture, and admin activity reports.",
    lifespan=lifespan,
)

origins = [
    origin.strip()
    for origin in os.getenv("CALLER_FRONTEND_ORIGINS", "http://localhost:5174,http://127.0.0.1:5174").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(caller_router)


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}
