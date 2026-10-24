import os
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .graphql import graphql_router

@asynccontextmanager
async def lifespan(application: FastAPI):
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        pool_min_size = max(1, int(os.getenv("DB_POOL_MIN_SIZE", "1")))
        pool_max_size = max(pool_min_size, int(os.getenv("DB_POOL_MAX_SIZE", "3")))
        application.state.pool = await asyncpg.create_pool(
            database_url,
            min_size=pool_min_size,
            max_size=pool_max_size,
        )
    else:
        application.state.pool = None
    try:
        yield
    finally:
        if application.state.pool is not None:
            await application.state.pool.close()


app = FastAPI(
    title="Electoral Intelligence API",
    version="0.2.0",
    description="GraphQL API for the Electoral Intelligence dashboard",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(graphql_router, prefix="/graphql")


@app.get("/", tags=["Root"])
async def root():
    return {"name": "Electoral Intelligence API", "version": app.version, "graphql": "/graphql", "health": "/health"}


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok"}
