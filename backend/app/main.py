import os
import hmac
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import asyncpg
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

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

frontend_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(graphql_router, prefix="/graphql")


class CallReportIn(BaseModel):
    """Normalized caller-tool event mapped to the production call schema."""

    provider: str = Field(min_length=1, max_length=80)
    call_id: str = Field(min_length=1, max_length=200)
    occurred_at: datetime
    has_problem: bool
    summary: str | None = Field(default=None, max_length=10000)
    category: str | None = Field(default=None, max_length=200)
    sid: int | None = None
    ac_no: int | None = None
    village_id: int | None = None
    feedback: str | None = Field(default=None, max_length=10000)

    @model_validator(mode="after")
    def require_area_and_problem_text(self):
        if self.ac_no is None and self.village_id is None and self.sid is None:
            raise ValueError("Provide sid, village_id, or ac_no for area attribution")
        if self.has_problem and not (self.summary and self.summary.strip()):
            raise ValueError("summary is required when has_problem is true")
        return self


@app.post("/webhooks/calls", tags=["Call reports"])
async def receive_call_report(
    report: CallReportIn,
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """Accept a normalized call event; its flag controls dashboard visibility."""
    secret = os.getenv("CALL_WEBHOOK_SECRET", "")
    if not secret:
        raise HTTPException(status_code=503, detail="Call webhook is not configured")
    expected = f"Bearer {secret}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Invalid webhook credentials")

    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="Database is unavailable")

    try:
        occurred_at = report.occurred_at
        if occurred_at.tzinfo is None:
            occurred_at = occurred_at.replace(tzinfo=timezone.utc)
        ac_no = report.ac_no
        village_id = report.village_id
        if report.sid is not None:
            sampark = await pool.fetchrow(
                "SELECT ac_no, village_id FROM sampark_sutra WHERE sid = $1", report.sid,
            )
            if sampark is None:
                raise HTTPException(status_code=422, detail="Unknown sampark_sutra sid")
            if ac_no is not None and sampark["ac_no"] is not None and sampark["ac_no"] != ac_no:
                raise HTTPException(status_code=422, detail="sid does not belong to the supplied assembly")
            if village_id is not None and sampark["village_id"] not in (None, village_id):
                raise HTTPException(status_code=422, detail="sid does not belong to the supplied village")
            ac_no = sampark["ac_no"] or ac_no
            village_id = village_id or sampark["village_id"]
        if village_id is not None:
            village_ac_no = await pool.fetchval(
                "SELECT ac_no FROM villages WHERE village_id = $1", village_id,
            )
            if village_ac_no is None:
                raise HTTPException(status_code=422, detail="Unknown village_id")
            if ac_no is not None and village_ac_no != ac_no:
                raise HTTPException(status_code=422, detail="Village does not belong to the supplied assembly")
            ac_no = village_ac_no
        if ac_no is None:
            raise HTTPException(status_code=422, detail="The supplied caller or area has no assembly assignment")
        row = await pool.fetchrow(
            """INSERT INTO public."call" (
                   provider, provider_call_id, created_at, summary, category,
                   sid, ac_no, village_id, flag, feedback
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
               ON CONFLICT (provider, provider_call_id)
                   WHERE provider_call_id IS NOT NULL DO UPDATE SET
                   created_at = EXCLUDED.created_at,
                   summary = EXCLUDED.summary,
                   category = EXCLUDED.category,
                   sid = EXCLUDED.sid,
                   ac_no = EXCLUDED.ac_no,
                   village_id = EXCLUDED.village_id,
                   flag = EXCLUDED.flag,
                   feedback = EXCLUDED.feedback
               RETURNING cid""",
            report.provider.strip(), report.call_id.strip(), occurred_at,
            report.summary.strip() if report.summary else None,
            report.category, report.sid, ac_no, village_id,
            "true" if report.has_problem else "false", report.feedback,
        )
    except asyncpg.ForeignKeyViolationError as exc:
        raise HTTPException(status_code=422, detail="Unknown assembly or village area") from exc
    return {"status": "accepted", "report_id": row["cid"]}


@app.get("/", tags=["Root"])
async def root():
    return {"name": "Electoral Intelligence API", "version": app.version, "graphql": "/graphql", "health": "/health"}


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok"}
