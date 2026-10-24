import os
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .graphql import graphql_router

@asynccontextmanager
async def lifespan(application: FastAPI):
    database_url = os.getenv("DATABASE_URL")
    application.state.pool = await asyncpg.create_pool(database_url) if database_url else None
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
