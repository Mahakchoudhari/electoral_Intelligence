"""REST endpoints for the authenticated caller workspace."""

from __future__ import annotations

import csv
import io
import hmac
import hashlib
import json
import secrets
import time
from datetime import date, datetime, timezone
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/caller", tags=["Caller workspace"])
_sessions: dict[str, tuple[int, str, float, str]] = {}
_SESSION_TTL = 60 * 60 * 12
_PBKDF2_ITERATIONS = 310_000


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class CreateUserIn(BaseModel):
    username: str = Field(min_length=3, max_length=100, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=4, max_length=200)
    role: str = Field(default="caller", pattern=r"^(caller|admin)$")


class SamparkSutraUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    fathers_name: str | None = Field(default=None, max_length=200)
    age: int | None = Field(default=None, ge=1, le=130)
    caste: str | None = Field(default=None, max_length=100)
    epic_id: str | None = Field(default=None, max_length=50)
    social_media: str | None = Field(default=None, max_length=255)
    flag: str | None = Field(default=None, max_length=100)


class CreateSamparkSutraIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=6, max_length=30)
    ac_no: int
    village_id: int
    fathers_name: str | None = Field(default=None, max_length=200)
    age: int | None = Field(default=None, ge=1, le=130)
    caste: str | None = Field(default=None, max_length=100)
    epic_id: str | None = Field(default=None, max_length=50)
    social_media: str | None = Field(default=None, max_length=255)
    flag: str | None = Field(default=None, max_length=100)


class CallIn(BaseModel):
    sid: int
    ac_no: int
    village_id: int
    has_problem: bool
    summary: str = Field(default="", max_length=10000)
    category: str = Field(default="", max_length=200)
    feedback: str = Field(default="", max_length=10000)
    update_sutra: bool = False
    sutra_data: SamparkSutraUpdate | None = None


def hash_password(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS,
    ).hex()


def create_session(pid: int, username: str, role: str) -> dict[str, str | int]:
    token = secrets.token_urlsafe(32)
    _sessions[token] = (pid, role, time.time() + _SESSION_TTL, username)
    return {"access_token": token, "token_type": "bearer", "expires_in": _SESSION_TTL, "role": role}


# @router.post("/signup", status_code=201)
# async def signup(payload: SignupIn, request: Request) -> dict[str, str | int]:
#     pool = get_pool(request)
#     username = payload.username.strip().lower()
#     exists = await pool.fetchval(
#         "SELECT EXISTS (SELECT 1 FROM call_centre_user WHERE lower(username) = $1)",
#         username,
#     )
#     if exists:
#         raise HTTPException(status_code=409, detail="That username is already taken")
#     salt = secrets.token_bytes(16)
#     salt_text = salt.hex()
#     password_hash = hash_password(payload.password, salt)
#     try:
#         row = await pool.fetchrow(
#             """INSERT INTO call_centre_user (username, hashed_password, salt)
#                VALUES ($1, $2, $3) RETURNING pid, username, role""",
#             username, password_hash, salt_text,
#         )
#     except asyncpg.UniqueViolationError as exc:
#         raise HTTPException(status_code=409, detail="That username is already taken") from exc
#     return create_session(row["pid"], row["username"], row["role"])


@router.post("/login")
async def login(payload: LoginIn, request: Request) -> dict[str, str | int]:
    row = await get_pool(request).fetchrow(
        """SELECT pid, username, hashed_password, salt, role FROM call_centre_user
           WHERE lower(username) = lower($1)""", payload.username.strip(),
    )
    if row is None:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    try:
        salt = bytes.fromhex(row["salt"])
        expected_hash = row["hashed_password"]
        provided_hash = hash_password(payload.password, salt)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    if not hmac.compare_digest(provided_hash, expected_hash or ""):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    return create_session(row["pid"], row["username"], row["role"])


async def require_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sign in to continue")
    token = authorization[7:]
    session = _sessions.get(token)
    if session is None or session[2] <= time.time():
        _sessions.pop(token, None)
        raise HTTPException(status_code=401, detail="Your session has expired")
    username = session[3] if len(session) > 3 else "caller"
    return {"pid": session[0], "role": session[1], "username": username}


async def log_sutra_audit(
    pool: Any,
    sid: int | None,
    action: str,
    caller: dict[str, Any],
    contact_name: str | None,
    contact_phone: str | None,
    ac_no: int | None,
    village_id: int | None,
    details: dict[str, Any] | None,
) -> None:
    try:
        details_json = json.dumps(details, default=str) if details is not None else None
        await pool.execute(
            """INSERT INTO public.sampark_sutra_audit_log (
                   sid, action, caller_pid, username, contact_name, contact_phone,
                   ac_no, village_id, details
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)""",
            sid, action, caller.get("pid"), caller.get("username"),
            contact_name, contact_phone, ac_no, village_id, details_json,
        )
    except Exception as exc:
        print(f"Failed to record audit log: {exc}")


async def require_caller(user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    if user["role"] != "caller":
        raise HTTPException(status_code=403, detail="Caller account required")
    return user


async def require_admin(
    request: Request,
    user: dict[str, Any] = Depends(require_user),
) -> dict[str, Any]:
    role = await get_pool(request).fetchval(
        "SELECT role FROM call_centre_user WHERE pid = $1", user["pid"],
    )
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def get_pool(request: Request) -> Any:
    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="Database is unavailable")
    return pool


TARGET_DISTRICT_NAMES = (
    "Agra",
    "Aligarh",
    "Amroha",
    "Baghpat",
    "Bijnor",
    "Bulandshahr",
    "Gautam Buddha Nagar",
    "Ghaziabad",
    "Hathras",
    "Mathura",
    "Meerut",
    "Moradabad",
    "Muzaffarnagar",
    "Saharanpur",
    "Shamli",
)


@router.get("/districts")
async def list_districts(request: Request, _: dict[str, Any] = Depends(require_user)):
    names_tuple = ", ".join(f"'{name}'" for name in TARGET_DISTRICT_NAMES)
    rows = await get_pool(request).fetch(
        f"""SELECT district_code, name FROM districts
           WHERE name IN ({names_tuple})
           ORDER BY name"""
    )
    return [{"district_code": row["district_code"], "name": row["name"]} for row in rows]


@router.get("/assemblies")
async def list_assemblies(
    district_code: int | None = None,
    request: Request = None,
    _: dict[str, Any] = Depends(require_user),
):
    pool = get_pool(request)
    if district_code is not None:
        rows = await pool.fetch(
            """SELECT ac_no, COALESCE(geojson_name, name) AS name, district_code FROM ac
               WHERE district_code = $1 ORDER BY ac_no""", district_code,
        )
    else:
        rows = await pool.fetch(
            """SELECT ac_no, COALESCE(geojson_name, name) AS name, district_code FROM ac
               ORDER BY name, ac_no"""
        )
    return [{"ac_no": row["ac_no"], "name": row["name"], "district_code": row["district_code"]} for row in rows]


@router.get("/villages")
async def list_villages(
    ac_no: int,
    request: Request,
    has_contacts: bool = True,
    _: dict[str, Any] = Depends(require_user),
):
    pool = get_pool(request)
    if has_contacts:
        rows = await pool.fetch(
            """SELECT v.village_id, v.name, count(ss.sid) AS contact_count
               FROM villages v
               JOIN sampark_sutra ss ON ss.village_id = v.village_id
               WHERE v.ac_no = $1
               GROUP BY v.village_id, v.name
               HAVING count(ss.sid) > 0
               ORDER BY v.name""",
            ac_no,
        )
    else:
        rows = await pool.fetch(
            """SELECT v.village_id, v.name, count(ss.sid) AS contact_count
               FROM villages v
               LEFT JOIN sampark_sutra ss ON ss.village_id = v.village_id
               WHERE v.ac_no = $1
               GROUP BY v.village_id, v.name
               ORDER BY v.name""",
            ac_no,
        )
    return [
        {
            "village_id": row["village_id"],
            "name": row["name"],
            "contact_count": row["contact_count"],
        }
        for row in rows
    ]


async def update_sutra_record(
    pool: Any,
    sid: int,
    data: SamparkSutraUpdate,
    caller: dict[str, Any] | None = None,
) -> dict[str, Any]:
    row_before = await pool.fetchrow(
        """SELECT sid, ac_no, village_id, name, phone, fathers_name, age, caste,
                  "EPIC_ID" AS epic_id, social_media, flag
           FROM public.sampark_sutra WHERE sid = $1""",
        sid,
    )
    if row_before is None:
        raise HTTPException(status_code=404, detail="Sampark Sutra not found")

    fields: list[str] = []
    values: list[Any] = []
    idx = 1

    if data.name is not None and data.name.strip():
        fields.append(f"name = ${idx}")
        values.append(data.name.strip())
        idx += 1
    if data.phone is not None and data.phone.strip():
        fields.append(f"phone = ${idx}")
        values.append(data.phone.strip())
        idx += 1
    if data.fathers_name is not None:
        fields.append(f"fathers_name = ${idx}")
        values.append(data.fathers_name.strip() or None)
        idx += 1
    if data.age is not None:
        fields.append(f"age = ${idx}")
        values.append(data.age)
        idx += 1
    if data.caste is not None:
        fields.append(f"caste = ${idx}")
        values.append(data.caste.strip() or None)
        idx += 1
    if data.epic_id is not None:
        fields.append(f'"EPIC_ID" = ${idx}')
        values.append(data.epic_id.strip() or None)
        idx += 1
    if data.social_media is not None:
        fields.append(f"social_media = ${idx}")
        values.append(data.social_media.strip() or None)
        idx += 1
    if data.flag is not None:
        fields.append(f"flag = ${idx}")
        values.append(data.flag.strip() or None)
        idx += 1

    if fields:
        values.append(sid)
        row_after = await pool.fetchrow(
            f"""UPDATE public.sampark_sutra
               SET {', '.join(fields)}
               WHERE sid = ${idx}
               RETURNING sid, ac_no, village_id, name, phone, fathers_name, age, caste,
                         "EPIC_ID" AS epic_id, social_media, flag""",
            *values,
        )
    else:
        row_after = row_before

    # Record changes in audit log
    changes: dict[str, dict[str, Any]] = {}
    for key in ("name", "phone", "fathers_name", "age", "caste", "epic_id", "social_media", "flag"):
        if row_before[key] != row_after[key]:
            changes[key] = {"before": row_before[key], "after": row_after[key]}
    if changes and caller:
        await log_sutra_audit(
            pool=pool,
            sid=sid,
            action="UPDATED",
            caller=caller,
            contact_name=row_after["name"],
            contact_phone=row_after["phone"],
            ac_no=row_after["ac_no"],
            village_id=row_after["village_id"],
            details={"changes": changes},
        )

    return {
        "sid": row_after["sid"],
        "ac_no": row_after["ac_no"],
        "village_id": row_after["village_id"],
        "name": row_after["name"] or "Unnamed contact",
        "phone": row_after["phone"],
        "fathers_name": row_after["fathers_name"],
        "age": row_after["age"],
        "caste": row_after["caste"],
        "epic_id": row_after["epic_id"],
        "social_media": row_after["social_media"],
        "flag": row_after["flag"],
    }


@router.get("/sampark-sutras")
async def list_sampark_sutras(
    village_id: int | None = None,
    ac_no: int | None = None,
    district_code: int | None = None,
    never_called: bool = False,
    search: str | None = None,
    limit: int = 5000,
    request: Request = None,
    _: dict[str, Any] = Depends(require_caller),
):
    pool = get_pool(request)
    conditions = []
    params = []
    idx = 1

    if village_id is not None:
        conditions.append(f"ss.village_id = ${idx}")
        params.append(village_id)
        idx += 1
    elif ac_no is not None:
        conditions.append(f"(ss.ac_no = ${idx} OR v.ac_no = ${idx})")
        params.append(ac_no)
        idx += 1
    elif district_code is not None:
        conditions.append(f"a.district_code = ${idx}")
        params.append(district_code)
        idx += 1

    if never_called:
        conditions.append("NOT EXISTS (SELECT 1 FROM public.\"call\" c WHERE c.sid = ss.sid)")

    if search and search.strip():
        term = f"%{search.strip()}%"
        conditions.append(f"(ss.name ILIKE ${idx} OR ss.phone ILIKE ${idx} OR ss.fathers_name ILIKE ${idx})")
        params.append(term)
        idx += 1

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    query = f"""
        SELECT ss.sid, ss.ac_no, ss.village_id, ss.name, ss.phone, ss.fathers_name,
               ss.age, ss.caste, ss."EPIC_ID" AS epic_id, ss.social_media, ss.flag,
               v.name AS village_name,
               COALESCE(a.geojson_name, a.name) AS ac_name,
               d.name AS district_name,
               (SELECT count(*) FROM public."call" c WHERE c.sid = ss.sid) AS call_count
        FROM sampark_sutra ss
        LEFT JOIN villages v ON v.village_id = ss.village_id
        LEFT JOIN ac a ON a.ac_no = COALESCE(ss.ac_no, v.ac_no)
        LEFT JOIN districts d ON d.district_code = a.district_code
        {where_clause}
        ORDER BY ss.name NULLS LAST, ss.sid
        LIMIT {max(1, min(limit, 10000))}
    """
    rows = await pool.fetch(query, *params)
    return [
        {
            "sid": row["sid"],
            "ac_no": row["ac_no"],
            "village_id": row["village_id"],
            "name": row["name"] or "Unnamed contact",
            "phone": row["phone"],
            "fathers_name": row["fathers_name"],
            "age": row["age"],
            "caste": row["caste"],
            "epic_id": row["epic_id"],
            "social_media": row["social_media"],
            "flag": row["flag"],
            "village_name": row["village_name"],
            "ac_name": row["ac_name"],
            "district_name": row["district_name"],
            "call_count": row["call_count"],
        }
        for row in rows
    ]


@router.post("/sampark-sutras", status_code=201)
async def create_sampark_sutra(
    payload: CreateSamparkSutraIn,
    request: Request,
    caller: dict[str, Any] = Depends(require_caller),
):
    pool = get_pool(request)
    name = payload.name.strip()
    phone = payload.phone.strip()

    # Check if phone already registered
    existing = await pool.fetchrow(
        "SELECT sid, name FROM public.sampark_sutra WHERE phone = $1", phone,
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Phone number already registered to '{existing['name']}' (ID #{existing['sid']})",
        )

    # Validate village and AC link
    v_row = await pool.fetchrow(
        """SELECT v.village_id, v.name AS village_name, a.name AS ac_name, d.name AS district_name
           FROM villages v
           JOIN ac a ON a.ac_no = v.ac_no
           JOIN districts d ON d.district_code = a.district_code
           WHERE v.village_id = $1 AND v.ac_no = $2""",
        payload.village_id, payload.ac_no,
    )
    if v_row is None:
        raise HTTPException(
            status_code=422,
            detail="Selected village does not match the chosen Assembly Constituency",
        )

    fathers_name = payload.fathers_name.strip() if payload.fathers_name else None
    caste = payload.caste.strip() if payload.caste else None
    epic_id = payload.epic_id.strip() if payload.epic_id else None
    social_media = payload.social_media.strip() if payload.social_media else None
    flag = payload.flag.strip() if payload.flag else None

    row = await pool.fetchrow(
        """INSERT INTO public.sampark_sutra (
               name, phone, ac_no, village_id, fathers_name, age, caste,
               "EPIC_ID", social_media, flag
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING sid, ac_no, village_id, name, phone, fathers_name, age, caste,
                     "EPIC_ID" AS epic_id, social_media, flag""",
        name, phone, payload.ac_no, payload.village_id, fathers_name,
        payload.age, caste, epic_id, social_media, flag,
    )

    contact_dict = {
        "sid": row["sid"],
        "ac_no": row["ac_no"],
        "village_id": row["village_id"],
        "name": row["name"],
        "phone": row["phone"],
        "fathers_name": row["fathers_name"],
        "age": row["age"],
        "caste": row["caste"],
        "epic_id": row["epic_id"],
        "social_media": row["social_media"],
        "flag": row["flag"],
        "village_name": v_row["village_name"],
        "ac_name": v_row["ac_name"],
        "district_name": v_row["district_name"],
        "call_count": 0,
    }

    await log_sutra_audit(
        pool=pool,
        sid=row["sid"],
        action="CREATED",
        caller=caller,
        contact_name=name,
        contact_phone=phone,
        ac_no=payload.ac_no,
        village_id=payload.village_id,
        details=contact_dict,
    )

    return contact_dict


@router.delete("/sampark-sutras/{sid}")
async def delete_sampark_sutra(
    sid: int,
    reason: str | None = None,
    request: Request = None,
    caller: dict[str, Any] = Depends(require_caller),
):
    pool = get_pool(request)
    row = await pool.fetchrow(
        """SELECT ss.sid, ss.name, ss.phone, ss.ac_no, ss.village_id, ss.fathers_name,
                  ss.age, ss.caste, ss."EPIC_ID" AS epic_id, ss.social_media, ss.flag,
                  v.name AS village_name, COALESCE(a.geojson_name, a.name) AS ac_name
           FROM sampark_sutra ss
           LEFT JOIN villages v ON v.village_id = ss.village_id
           LEFT JOIN ac a ON a.ac_no = ss.ac_no
           WHERE ss.sid = $1""",
        sid,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Sampark Sutra not found")

    contact_name = row["name"]
    contact_phone = row["phone"]
    snapshot = dict(row)

    await pool.execute("DELETE FROM public.sampark_sutra WHERE sid = $1", sid)

    await log_sutra_audit(
        pool=pool,
        sid=sid,
        action="DELETED",
        caller=caller,
        contact_name=contact_name,
        contact_phone=contact_phone,
        ac_no=row["ac_no"],
        village_id=row["village_id"],
        details={"snapshot": snapshot, "reason": reason.strip() if reason else None},
    )

    return {"message": f"Sampark Sutra '{contact_name}' was removed successfully", "sid": sid}


@router.get("/sampark-sutras/audit-logs")
async def list_audit_logs(
    sid: int | None = None,
    action: str | None = None,
    limit: int = 100,
    request: Request = None,
    _: dict[str, Any] = Depends(require_caller),
):
    pool = get_pool(request)
    conditions = []
    params = []
    idx = 1
    if sid is not None:
        conditions.append(f"sid = ${idx}")
        params.append(sid)
        idx += 1
    if action and action.strip():
        conditions.append(f"action = ${idx}")
        params.append(action.strip().upper())
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    query = f"""
        SELECT log_id, sid, action, caller_pid, username, contact_name, contact_phone,
               ac_no, village_id, details, created_at,
               to_char(timezone('Asia/Kolkata', created_at), 'DD Mon YYYY, HH24:MI') AS time_formatted
        FROM public.sampark_sutra_audit_log
        {where}
        ORDER BY created_at DESC, log_id DESC
        LIMIT {max(1, min(limit, 500))}
    """
    rows = await pool.fetch(query, *params)
    return [
        {
            "log_id": r["log_id"],
            "sid": r["sid"],
            "action": r["action"],
            "caller_pid": r["caller_pid"],
            "username": r["username"] or "System",
            "contact_name": r["contact_name"],
            "contact_phone": r["contact_phone"],
            "ac_no": r["ac_no"],
            "village_id": r["village_id"],
            "details": json.loads(r["details"]) if isinstance(r["details"], str) else (r["details"] or {}),
            "created_at": r["created_at"].isoformat(),
            "time_formatted": r["time_formatted"],
        }
        for r in rows
    ]


@router.get("/sampark-sutras/{sid}")
async def get_sampark_sutra(sid: int, request: Request, _: dict[str, Any] = Depends(require_caller)):
    row = await get_pool(request).fetchrow(
        """SELECT ss.sid, ss.ac_no, ss.village_id, ss.name, ss.phone, ss.fathers_name,
                  ss.age, ss.caste, ss."EPIC_ID" AS epic_id, ss.social_media, ss.flag,
                  v.name AS village_name, COALESCE(a.geojson_name, a.name) AS ac_name,
                  d.name AS district_name,
                  (SELECT count(*) FROM public."call" c WHERE c.sid = ss.sid) AS call_count
           FROM sampark_sutra ss
           LEFT JOIN villages v ON v.village_id = ss.village_id
           LEFT JOIN ac a ON a.ac_no = COALESCE(ss.ac_no, v.ac_no)
           LEFT JOIN districts d ON d.district_code = a.district_code
           WHERE ss.sid = $1""", sid,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Sampark Sutra contact not found")
    return {
        "sid": row["sid"],
        "ac_no": row["ac_no"],
        "village_id": row["village_id"],
        "name": row["name"] or "Unnamed contact",
        "phone": row["phone"],
        "fathers_name": row["fathers_name"],
        "age": row["age"],
        "caste": row["caste"],
        "epic_id": row["epic_id"],
        "social_media": row["social_media"],
        "flag": row["flag"],
        "village_name": row["village_name"],
        "ac_name": row["ac_name"],
        "district_name": row["district_name"],
        "call_count": row["call_count"],
    }


@router.get("/sampark-sutras/{sid}/calls")
async def get_contact_calls(
    sid: int,
    request: Request,
    _: dict[str, Any] = Depends(require_caller),
):
    pool = get_pool(request)
    rows = await pool.fetch(
        """SELECT c.cid, c.sid, c.created_at,
                  to_char(timezone('Asia/Kolkata', c.created_at), 'DD Mon YYYY, HH24:MI') AS call_time,
                  c.summary, c.category, c.feedback, c.provider,
                  lower(COALESCE(c.flag, '')) IN ('true', '1', 'yes', 'problem', 'substantive') AS has_problem,
                  u.username AS caller_username
           FROM public."call" c
           LEFT JOIN public.call_centre_user u ON u.pid = c.caller_pid
           WHERE c.sid = $1
           ORDER BY c.created_at DESC""",
        sid,
    )
    return [
        {
            "cid": r["cid"],
            "sid": r["sid"],
            "created_at": r["created_at"].isoformat(),
            "call_time": r["call_time"],
            "caller_username": r["caller_username"] or "Caller",
            "summary": r["summary"],
            "category": r["category"],
            "feedback": r["feedback"],
            "has_problem": r["has_problem"],
            "provider": r["provider"],
        }
        for r in rows
    ]


@router.patch("/sampark-sutras/{sid}")
async def update_sampark_sutra_endpoint(
    sid: int,
    payload: SamparkSutraUpdate,
    request: Request,
    caller: dict[str, Any] = Depends(require_caller),
):
    pool = get_pool(request)
    return await update_sutra_record(pool, sid, payload, caller=caller)


@router.post("/calls", status_code=201)
async def create_call(
    payload: CallIn, request: Request, caller: dict[str, Any] = Depends(require_caller),
) -> dict[str, Any]:
    pool = get_pool(request)
    sutra = await pool.fetchrow(
        """SELECT ss.sid, ss.ac_no, ss.village_id FROM sampark_sutra ss
           JOIN villages v ON v.village_id = ss.village_id
           WHERE ss.sid = $1 AND ss.village_id = $2 AND v.ac_no = $3""",
        payload.sid, payload.village_id, payload.ac_no,
    )
    if sutra is None:
        raise HTTPException(status_code=422, detail="Sampark Sutra does not match the selected village and AC")
    if payload.has_problem and not payload.summary.strip():
        raise HTTPException(status_code=422, detail="Add a short summary for a reported issue")

    call_id = f"caller-{secrets.token_urlsafe(18)}"
    summary = payload.summary.strip()
    if not summary and not payload.has_problem:
        summary = "Profile verified & missing details updated" if payload.update_sutra else "No issue reported"
    category = payload.category.strip()
    if not category and not payload.has_problem:
        category = "Profile & Information"

    row = await pool.fetchrow(
        """INSERT INTO public."call" (
               provider, provider_call_id, created_at, summary, category,
               sid, ac_no, village_id, caller_pid, flag, feedback
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING cid, created_at""",
        "caller-dashboard", call_id, datetime.now(timezone.utc),
        summary or None, category or None,
        payload.sid, payload.ac_no, payload.village_id, caller["pid"],
        "true" if payload.has_problem else "false", payload.feedback.strip() or None,
    )

    updated_sutra = None
    if payload.update_sutra and payload.sutra_data is not None:
        updated_sutra = await update_sutra_record(pool, payload.sid, payload.sutra_data, caller=caller)

    return {
        "report_id": row["cid"],
        "call_id": call_id,
        "created_at": row["created_at"].isoformat(),
        "caller_pid": caller["pid"],
        "updated_sutra": updated_sutra,
    }


async def fetch_filtered_admin_calls(
    pool: Any,
    date_from: date | None = None,
    date_to: date | None = None,
    caller_pid: int | None = None,
    district_code: int | None = None,
    ac_no: int | None = None,
    has_problem: bool | None = None,
    search: str | None = None,
) -> list[asyncpg.Record]:
    conditions = ["c.caller_pid IS NOT NULL"]
    params: list[Any] = []
    idx = 1

    if date_from is not None:
        conditions.append(f"timezone('Asia/Kolkata', c.created_at)::date >= ${idx}")
        params.append(date_from)
        idx += 1

    if date_to is not None:
        conditions.append(f"timezone('Asia/Kolkata', c.created_at)::date <= ${idx}")
        params.append(date_to)
        idx += 1

    if caller_pid is not None:
        conditions.append(f"c.caller_pid = ${idx}")
        params.append(caller_pid)
        idx += 1

    if district_code is not None:
        conditions.append(f"d.district_code = ${idx}")
        params.append(district_code)
        idx += 1

    if ac_no is not None:
        conditions.append(f"COALESCE(c.ac_no, ss.ac_no) = ${idx}")
        params.append(ac_no)
        idx += 1

    if has_problem is not None:
        if has_problem:
            conditions.append("lower(COALESCE(c.flag, '')) IN ('true', '1', 'yes', 'problem', 'substantive')")
        else:
            conditions.append("lower(COALESCE(c.flag, '')) NOT IN ('true', '1', 'yes', 'problem', 'substantive')")

    if search and search.strip():
        term = f"%{search.strip()}%"
        conditions.append(
            f"(u.username ILIKE ${idx} OR ss.name ILIKE ${idx} OR ss.phone ILIKE ${idx} "
            f"OR v.name ILIKE ${idx} OR c.summary ILIKE ${idx} OR c.category ILIKE ${idx} "
            f"OR c.feedback ILIKE ${idx} OR a.name ILIKE ${idx} OR d.name ILIKE ${idx})"
        )
        params.append(term)
        idx += 1

    where_clause = "WHERE " + " AND ".join(conditions)

    query = f"""
        SELECT c.caller_pid, u.username,
               timezone('Asia/Kolkata', c.created_at)::date AS work_date,
               c.cid,
               to_char(timezone('Asia/Kolkata', c.created_at), 'HH24:MI') AS call_time,
               to_char(timezone('Asia/Kolkata', c.created_at), 'YYYY-MM-DD HH24:MI:SS') AS created_at_formatted,
               c.created_at,
               c.summary, c.category, c.feedback, c.provider,
               lower(COALESCE(c.flag, '')) IN ('true', '1', 'yes', 'problem', 'substantive') AS has_problem,
               ss.name AS sampark_sutra_name, ss.phone AS sampark_sutra_phone,
               v.name AS village_name,
               COALESCE(a.geojson_name, a.name) AS assembly_name,
               COALESCE(c.ac_no, ss.ac_no) AS ac_no,
               d.name AS district_name,
               d.district_code
        FROM public."call" c
        JOIN call_centre_user u ON u.pid = c.caller_pid
        LEFT JOIN sampark_sutra ss ON ss.sid = c.sid
        LEFT JOIN villages v ON v.village_id = COALESCE(c.village_id, ss.village_id)
        LEFT JOIN ac a ON a.ac_no = COALESCE(c.ac_no, ss.ac_no)
        LEFT JOIN districts d ON d.district_code = a.district_code
        {where_clause}
        ORDER BY work_date DESC, u.username, c.created_at DESC, c.cid DESC
    """
    return await pool.fetch(query, *params)


@router.get("/admin/activity")
async def admin_activity(
    request: Request,
    date_from: date | None = None,
    date_to: date | None = None,
    caller_pid: int | None = None,
    district_code: int | None = None,
    ac_no: int | None = None,
    has_problem: bool | None = None,
    search: str | None = None,
    _: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    pool = get_pool(request)
    callers = await pool.fetch(
        "SELECT pid, username FROM call_centre_user WHERE role = 'caller' ORDER BY username"
    )
    rows = await fetch_filtered_admin_calls(
        pool=pool,
        date_from=date_from,
        date_to=date_to,
        caller_pid=caller_pid,
        district_code=district_code,
        ac_no=ac_no,
        has_problem=has_problem,
        search=search,
    )

    groups: dict[tuple[int, str, date], dict[str, Any]] = {}
    caller_summary_map: dict[int, dict[str, Any]] = {}
    category_counts: dict[str, dict[str, int]] = {}
    assembly_counts: dict[str, int] = {}
    district_counts: dict[str, int] = {}
    all_calls: list[dict[str, Any]] = []

    total_calls = 0
    total_issues = 0

    for caller in callers:
        c_pid = caller["pid"]
        caller_summary_map[c_pid] = {
            "caller_pid": c_pid,
            "username": caller["username"],
            "total_calls": 0,
            "issues_reported": 0,
            "clear_calls": 0,
            "issue_rate_pct": 0.0,
            "districts": set(),
            "assemblies": set(),
            "villages": set(),
            "last_call_time": None,
            "dates_active": set(),
        }

    for row in rows:
        key = (row["caller_pid"], row["username"], row["work_date"])
        group = groups.setdefault(key, {
            "caller_pid": row["caller_pid"],
            "username": row["username"],
            "work_date": row["work_date"].isoformat(),
            "calls_logged": 0,
            "issues_reported": 0,
            "calls": [],
        })
        has_problem = row["has_problem"]
        group["calls_logged"] += 1
        group["issues_reported"] += int(has_problem)
        total_calls += 1
        total_issues += int(has_problem)

        call_item = {
            "report_id": row["cid"],
            "call_time": row["call_time"],
            "created_at_formatted": row["created_at_formatted"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "work_date": row["work_date"].isoformat(),
            "caller_pid": row["caller_pid"],
            "caller_username": row["username"],
            "sampark_sutra_name": row["sampark_sutra_name"],
            "sampark_sutra_phone": row["sampark_sutra_phone"],
            "village_name": row["village_name"],
            "assembly_name": row["assembly_name"],
            "ac_no": row["ac_no"],
            "district_name": row["district_name"],
            "district_code": row["district_code"],
            "summary": row["summary"],
            "category": row["category"] or "General / Uncategorized",
            "feedback": row["feedback"],
            "has_problem": has_problem,
            "provider": row["provider"],
        }
        group["calls"].append(call_item)
        all_calls.append(call_item)

        c_stat = caller_summary_map.setdefault(row["caller_pid"], {
            "caller_pid": row["caller_pid"],
            "username": row["username"],
            "total_calls": 0,
            "issues_reported": 0,
            "clear_calls": 0,
            "issue_rate_pct": 0.0,
            "districts": set(),
            "assemblies": set(),
            "villages": set(),
            "last_call_time": None,
            "dates_active": set(),
        })
        c_stat["total_calls"] += 1
        if has_problem:
            c_stat["issues_reported"] += 1
        else:
            c_stat["clear_calls"] += 1
        if row["district_name"]:
            c_stat["districts"].add(row["district_name"])
        if row["assembly_name"]:
            c_stat["assemblies"].add(row["assembly_name"])
        if row["village_name"]:
            c_stat["villages"].add(row["village_name"])
        c_stat["dates_active"].add(row["work_date"].isoformat())
        if c_stat["last_call_time"] is None and row["created_at_formatted"]:
            c_stat["last_call_time"] = row["created_at_formatted"]

        cat_key = row["category"] or "General / Uncategorized"
        cat_rec = category_counts.setdefault(cat_key, {"count": 0, "issues": 0})
        cat_rec["count"] += 1
        if has_problem:
            cat_rec["issues"] += 1

        if row["assembly_name"]:
            assembly_counts[row["assembly_name"]] = assembly_counts.get(row["assembly_name"], 0) + 1
        if row["district_name"]:
            district_counts[row["district_name"]] = district_counts.get(row["district_name"], 0) + 1

    caller_stats = []
    for c_stat in caller_summary_map.values():
        tot = c_stat["total_calls"]
        iss = c_stat["issues_reported"]
        rate = round((iss / tot * 100), 1) if tot > 0 else 0.0
        caller_stats.append({
            "caller_pid": c_stat["caller_pid"],
            "username": c_stat["username"],
            "total_calls": tot,
            "issues_reported": iss,
            "clear_calls": c_stat["clear_calls"],
            "issue_rate_pct": rate,
            "districts": sorted(list(c_stat["districts"])),
            "assemblies": sorted(list(c_stat["assemblies"])),
            "villages_count": len(c_stat["villages"]),
            "last_call_time": c_stat["last_call_time"],
            "days_active": len(c_stat["dates_active"]),
        })
    caller_stats.sort(key=lambda x: (x["total_calls"], x["issues_reported"]), reverse=True)

    sorted_categories = [
        {"category": k, "count": v["count"], "issues": v["issues"]}
        for k, v in sorted(category_counts.items(), key=lambda x: x[1]["count"], reverse=True)
    ]
    sorted_assemblies = [
        {"name": k, "count": v}
        for k, v in sorted(assembly_counts.items(), key=lambda x: x[1], reverse=True)
    ]
    sorted_districts = [
        {"name": k, "count": v}
        for k, v in sorted(district_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    unique_districts = {r["district_name"] for r in rows if r["district_name"]}
    unique_assemblies = {r["assembly_name"] for r in rows if r["assembly_name"]}
    unique_villages = {r["village_name"] for r in rows if r["village_name"]}
    active_callers_count = len({r["caller_pid"] for r in rows})
    overall_issue_rate = round((total_issues / total_calls * 100), 1) if total_calls > 0 else 0.0

    return {
        "callers": [{"pid": row["pid"], "username": row["username"]} for row in callers],
        "summary": {
            "calls_logged": total_calls,
            "issues_reported": total_issues,
            "clear_calls": total_calls - total_issues,
            "issue_rate_pct": overall_issue_rate,
            "active_callers": active_callers_count,
            "total_callers": len(callers),
            "districts_covered": len(unique_districts),
            "assemblies_covered": len(unique_assemblies),
            "villages_covered": len(unique_villages),
            "top_categories": sorted_categories[:12],
            "top_assemblies": sorted_assemblies[:12],
            "top_districts": sorted_districts[:12],
        },
        "caller_stats": caller_stats,
        "daily_activity": list(groups.values()),
        "all_calls": all_calls,
    }


@router.get("/admin/export-report")
async def export_admin_report(
    request: Request,
    date_from: date | None = None,
    date_to: date | None = None,
    caller_pid: int | None = None,
    district_code: int | None = None,
    ac_no: int | None = None,
    has_problem: bool | None = None,
    search: str | None = None,
    _: dict[str, Any] = Depends(require_admin),
) -> Response:
    pool = get_pool(request)
    rows = await fetch_filtered_admin_calls(
        pool=pool,
        date_from=date_from,
        date_to=date_to,
        caller_pid=caller_pid,
        district_code=district_code,
        ac_no=ac_no,
        has_problem=has_problem,
        search=search,
    )
    output = io.StringIO()
    # Write UTF-8 BOM so Excel opens Hindi/UTF-8 flawlessly
    output.write("\ufeff")
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
    writer.writerow([
        "Call ID",
        "Work Date",
        "Call Time (IST)",
        "Created At",
        "Caller Username",
        "District",
        "Assembly Constituency",
        "AC No",
        "Village",
        "Sampark Sutra Name",
        "Contact Phone",
        "Call Outcome",
        "Category",
        "Call Summary",
        "Feedback / Notes",
    ])
    for row in rows:
        writer.writerow([
            row["cid"],
            row["work_date"].isoformat() if row["work_date"] else "",
            row["call_time"] or "",
            row["created_at_formatted"] or "",
            row["username"] or "",
            row["district_name"] or "",
            row["assembly_name"] or "",
            row["ac_no"] or "",
            row["village_name"] or "",
            row["sampark_sutra_name"] or "",
            row["sampark_sutra_phone"] or "",
            "Issue Reported" if row["has_problem"] else "No Issue / Clear",
            row["category"] or "",
            row["summary"] or "",
            row["feedback"] or "",
        ])
    filename = f"caller_activity_report_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/admin/users", status_code=201)
async def create_user(
    payload: CreateUserIn,
    request: Request,
    _: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    pool = get_pool(request)
    username = payload.username.strip().lower()
    exists = await pool.fetchval(
        "SELECT EXISTS (SELECT 1 FROM call_centre_user WHERE lower(username) = $1)",
        username,
    )
    if exists:
        raise HTTPException(status_code=409, detail=f"Username '{username}' already exists")

    salt = secrets.token_bytes(16)
    password_hash = hash_password(payload.password, salt)
    role = payload.role if payload.role in ("caller", "admin") else "caller"
    try:
        row = await pool.fetchrow(
            """INSERT INTO call_centre_user (username, hashed_password, salt, role)
               VALUES ($1, $2, $3, $4)
               RETURNING pid, username, role""",
            username, password_hash, salt.hex(), role,
        )
    except asyncpg.UniqueViolationError as exc:
        raise HTTPException(status_code=409, detail=f"Username '{username}' already exists") from exc

    return {
        "pid": row["pid"],
        "username": row["username"],
        "role": row["role"],
        "message": f"User '{row['username']}' created successfully as {row['role']}",
    }
