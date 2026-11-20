"""AI Agent Service for Electoral Intelligence Database.

Answers questions about elections, assembly constituencies, districts,
booths, villages, voting shares, margins, and telephony/call reports by
executing relevant database tools as needed.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

import httpx

logger = logging.getLogger(__name__)

SELECTED_16_DISTRICT_CODES = (
    132, 133, 134, 135, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 704, 705
)

# ============================================================================
# DATABASE TOOLS
# ============================================================================

async def get_database_overview(pool: Any) -> dict[str, Any]:
    """Return high-level summary metrics of all electoral and call data in the database."""
    if pool is None:
        return {"error": "Database connection not available"}

    row = await pool.fetchrow("""
        SELECT 
            (SELECT COUNT(*) FROM districts)::int AS total_districts,
            (SELECT COUNT(*) FROM ac)::int AS total_acs,
            (SELECT COUNT(*) FROM election_booths)::int AS total_booths,
            (SELECT COUNT(*) FROM public."call")::int AS total_calls,
            (SELECT COUNT(*) FROM sampark_sutra)::int AS total_sampark_sutra_contacts,
            (SELECT COUNT(*) FROM villages)::int AS total_villages
    """)
    elections = await pool.fetch("SELECT election_id, election_year, election_type FROM elections ORDER BY election_year DESC")

    return {
        "metrics": dict(row) if row else {},
        "election_years": [dict(e) for e in elections],
        "focus_area": "16 Western & Central UP Districts with booth-level granularity and 403 AC boundaries statewide",
    }


async def list_districts(pool: Any, focus_only: bool = True) -> list[dict[str, Any]]:
    """List districts with their AC counts and booth counts."""
    if pool is None:
        return []

    focus_filter = ""
    if focus_only:
        codes_str = ",".join(str(c) for c in SELECTED_16_DISTRICT_CODES)
        focus_filter = f"WHERE d.district_code IN ({codes_str})"

    rows = await pool.fetch(f"""
        SELECT d.district_code,
               d.name AS district_name,
               d.state_name,
               COUNT(DISTINCT a.ac_no)::int AS ac_count,
               COUNT(eb.booth_id)::int AS booth_count
        FROM districts d
        LEFT JOIN ac a ON a.district_code = d.district_code
        LEFT JOIN election_booths eb ON eb.ac_no = a.ac_no
        {focus_filter}
        GROUP BY d.district_code, d.name, d.state_name
        ORDER BY booth_count DESC, d.name ASC
    """)
    return [dict(r) for r in rows]


async def search_assemblies(pool: Any, query: str = "", district_query: str | None = None) -> list[dict[str, Any]]:
    """Search for assembly constituencies by name or AC number, optionally filtered by district."""
    if pool is None:
        return []

    conditions = []
    params: list[Any] = []

    if query and query.strip():
        q = query.strip()
        if q.isdigit():
            params.append(int(q))
            conditions.append(f"a.ac_no = ${len(params)}")
        else:
            params.append(f"%{q.lower()}%")
            conditions.append(f"(LOWER(a.name) LIKE ${len(params)} OR LOWER(COALESCE(a.geojson_name, '')) LIKE ${len(params)})")

    if district_query and district_query.strip():
        dq = district_query.strip()
        if dq.isdigit():
            params.append(int(dq))
            conditions.append(f"d.district_code = ${len(params)}")
        else:
            params.append(f"%{dq.lower()}%")
            conditions.append(f"LOWER(d.name) LIKE ${len(params)}")

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    rows = await pool.fetch(f"""
        SELECT a.ac_no,
               COALESCE(a.geojson_name, a.name) AS ac_name,
               d.district_code,
               d.name AS district_name,
               COUNT(eb.booth_id)::int AS booth_count
        FROM ac a
        JOIN districts d ON d.district_code = a.district_code
        LEFT JOIN election_booths eb ON eb.ac_no = a.ac_no
        {where_clause}
        GROUP BY a.ac_no, a.geojson_name, a.name, d.district_code, d.name
        ORDER BY d.name ASC, a.ac_no ASC
        LIMIT 30
    """, *params)
    return [dict(r) for r in rows]


async def _resolve_ac_no(pool: Any, ac_identifier: str | int) -> int | None:
    """Helper to resolve an AC number from either an integer or name substring."""
    if isinstance(ac_identifier, int) or (isinstance(ac_identifier, str) and ac_identifier.strip().isdigit()):
        return int(ac_identifier)

    q = str(ac_identifier).strip().lower()
    # Remove common prefixes like 'ac ', 'ac-', 'constituency '
    q = re.sub(r"^(ac|assembly constituency|assembly|constituency)\s*", "", q).strip()
    if q.isdigit():
        return int(q)

    row = await pool.fetchrow("""
        SELECT ac_no FROM ac
        WHERE LOWER(name) = $1 OR LOWER(COALESCE(geojson_name, '')) = $1
        LIMIT 1
    """, q)
    if row:
        return row["ac_no"]

    row = await pool.fetchrow("""
        SELECT ac_no FROM ac
        WHERE LOWER(name) LIKE $1 OR LOWER(COALESCE(geojson_name, '')) LIKE $1
        ORDER BY LENGTH(name) ASC
        LIMIT 1
    """, f"%{q}%")
    return row["ac_no"] if row else None


async def _resolve_district_code(pool: Any, district_identifier: str | int) -> int | None:
    """Helper to resolve a district code from an integer or name substring."""
    if isinstance(district_identifier, int) or (isinstance(district_identifier, str) and district_identifier.strip().isdigit()):
        return int(district_identifier)

    q = str(district_identifier).strip().lower()
    q = re.sub(r"^(district)\s*", "", q).strip()
    if q.isdigit():
        return int(q)

    row = await pool.fetchrow("""
        SELECT district_code FROM districts
        WHERE LOWER(name) = $1
        LIMIT 1
    """, q)
    if row:
        return row["district_code"]

    row = await pool.fetchrow("""
        SELECT district_code FROM districts
        WHERE LOWER(name) LIKE $1
        ORDER BY LENGTH(name) ASC
        LIMIT 1
    """, f"%{q}%")
    return row["district_code"] if row else None


async def get_assembly_details(pool: Any, ac_identifier: str | int, election_year: int = 2022) -> dict[str, Any]:
    """Get full election results, voting shares, turnout, and call issues for an Assembly Constituency."""
    if pool is None:
        return {"error": "Database connection not available"}

    ac_no = await _resolve_ac_no(pool, ac_identifier)
    if not ac_no:
        return {"error": f"Constituency '{ac_identifier}' could not be found."}

    # Basic AC Info
    ac_info = await pool.fetchrow("""
        SELECT a.ac_no,
               COALESCE(a.geojson_name, a.name) AS ac_name,
               d.district_code,
               d.name AS district_name,
               d.state_name
        FROM ac a
        JOIN districts d ON d.district_code = a.district_code
        WHERE a.ac_no = $1
    """, ac_no)

    if not ac_info:
        return {"error": f"AC #{ac_no} not found."}

    # Results for specified election year
    res = await pool.fetchrow("""
        SELECT 
            eb.election_id,
            e.election_year,
            COUNT(eb.booth_id)::int AS booths,
            COALESCE(SUM(br.electors), 0)::bigint AS electors,
            COALESCE(SUM(br.votes_polled), 0)::bigint AS votes_polled,
            COALESCE(SUM(br.valid_votes), 0)::bigint AS valid_votes,
            COALESCE(SUM(br.votes_bjp), 0)::bigint AS bjp,
            COALESCE(SUM(br.votes_rld), 0)::bigint AS rld,
            COALESCE(SUM(br.votes_samajwadi), 0)::bigint AS sp,
            COALESCE(SUM(br.votes_bsp), 0)::bigint AS bsp,
            COALESCE(SUM(br.votes_inc), 0)::bigint AS inc,
            COALESCE(SUM(br.votes_aap), 0)::bigint AS aap,
            COALESCE(SUM(br.votes_aimim), 0)::bigint AS aimim,
            COALESCE(SUM(br.votes_asp), 0)::bigint AS asp,
            COALESCE(SUM(br.votes_ind), 0)::bigint AS ind,
            COALESCE(SUM(br.votes_nota), 0)::bigint AS nota
        FROM election_booths eb
        JOIN elections e ON e.election_id = eb.election_id
        LEFT JOIN booth_results br ON br.booth_id = eb.booth_id
        WHERE eb.ac_no = $1 AND e.election_year = $2
        GROUP BY eb.election_id, e.election_year
    """, ac_no, election_year)

    # Telephony Call issues for this AC
    calls = await pool.fetchrow("""
        SELECT 
            COUNT(*)::int AS total_calls,
            COUNT(CASE WHEN flag IN ('true', '1', 'yes', 'problem') THEN 1 END)::int AS issues_reported,
            COUNT(DISTINCT sid)::int AS unique_contacts_called
        FROM public."call"
        WHERE ac_no = $1
    """, ac_no)

    # Village count
    v_count = await pool.fetchval("SELECT COUNT(*)::int FROM villages WHERE ac_no = $1", ac_no)

    if not res or res["votes_polled"] == 0:
        return {
            "ac_no": ac_info["ac_no"],
            "ac_name": ac_info["ac_name"],
            "district_name": ac_info["district_name"],
            "state_name": ac_info["state_name"],
            "village_count": v_count or 0,
            "call_stats": dict(calls) if calls else {},
            "status": f"No voting results loaded for year {election_year} in AC #{ac_no} ({ac_info['ac_name']}).",
        }

    polled = res["votes_polled"]
    electors = res["electors"]
    turnout_pct = round(100.0 * polled / electors, 2) if electors > 0 else 0.0

    parties = {
        "BJP": res["bjp"],
        "RLD": res["rld"],
        "SP": res["sp"],
        "BSP": res["bsp"],
        "INC": res["inc"],
        "AAP": res["aap"],
        "AIMIM": res["aimim"],
        "ASP": res["asp"],
        "IND": res["ind"],
        "NOTA": res["nota"],
    }
    sorted_parties = sorted(parties.items(), key=lambda x: -x[1])
    winner_party, winner_votes = sorted_parties[0] if sorted_parties else ("N/A", 0)
    runner_up_party, runner_up_votes = sorted_parties[1] if len(sorted_parties) > 1 else ("N/A", 0)
    margin = winner_votes - runner_up_votes
    margin_pct = round(100.0 * margin / polled, 2) if polled > 0 else 0.0

    party_shares = {
        p: round(100.0 * v / polled, 2) if polled > 0 else 0.0
        for p, v in parties.items() if v > 0
    }

    return {
        "ac_no": ac_info["ac_no"],
        "ac_name": ac_info["ac_name"],
        "district_name": ac_info["district_name"],
        "state_name": ac_info["state_name"],
        "election_year": election_year,
        "booth_count": res["booths"],
        "village_count": v_count or 0,
        "electors": electors,
        "votes_polled": polled,
        "turnout_percent": turnout_pct,
        "winner": {
            "party": winner_party,
            "votes": winner_votes,
            "share_percent": round(100.0 * winner_votes / polled, 2) if polled > 0 else 0.0,
            "margin_votes": margin,
            "margin_percent": margin_pct,
            "runner_up": runner_up_party,
            "runner_up_votes": runner_up_votes,
        },
        "party_votes": {k: v for k, v in parties.items() if v > 0},
        "party_shares": party_shares,
        "call_stats": dict(calls) if calls else {},
    }


async def get_district_summary(pool: Any, district_identifier: str | int, election_year: int = 2022) -> dict[str, Any]:
    """Get aggregated election metrics and list of ACs for an entire district."""
    if pool is None:
        return {"error": "Database connection not available"}

    district_code = await _resolve_district_code(pool, district_identifier)
    if not district_code:
        return {"error": f"District '{district_identifier}' could not be found."}

    d_info = await pool.fetchrow("SELECT district_code, name, state_name FROM districts WHERE district_code = $1", district_code)
    if not d_info:
        return {"error": f"District code #{district_code} not found."}

    # Aggregate results for all ACs in this district
    agg = await pool.fetchrow("""
        SELECT 
            COUNT(DISTINCT a.ac_no)::int AS total_acs,
            COUNT(eb.booth_id)::int AS total_booths,
            COALESCE(SUM(br.electors), 0)::bigint AS electors,
            COALESCE(SUM(br.votes_polled), 0)::bigint AS votes_polled,
            COALESCE(SUM(br.votes_bjp), 0)::bigint AS bjp,
            COALESCE(SUM(br.votes_rld), 0)::bigint AS rld,
            COALESCE(SUM(br.votes_samajwadi), 0)::bigint AS sp,
            COALESCE(SUM(br.votes_bsp), 0)::bigint AS bsp,
            COALESCE(SUM(br.votes_inc), 0)::bigint AS inc
        FROM districts d
        JOIN ac a ON a.district_code = d.district_code
        JOIN election_booths eb ON eb.ac_no = a.ac_no
        JOIN elections e ON e.election_id = eb.election_id
        LEFT JOIN booth_results br ON br.booth_id = eb.booth_id
        WHERE d.district_code = $1 AND e.election_year = $2
    """, district_code, election_year)

    # Per-AC breakdown in this district
    ac_rows = await pool.fetch("""
        SELECT a.ac_no,
               COALESCE(a.geojson_name, a.name) AS ac_name,
               COUNT(eb.booth_id)::int AS booths,
               COALESCE(SUM(br.electors), 0)::bigint AS electors,
               COALESCE(SUM(br.votes_polled), 0)::bigint AS votes_polled,
               COALESCE(SUM(br.votes_bjp), 0)::bigint AS bjp,
               COALESCE(SUM(br.votes_rld), 0)::bigint AS rld,
               COALESCE(SUM(br.votes_samajwadi), 0)::bigint AS sp,
               COALESCE(SUM(br.votes_bsp), 0)::bigint AS bsp
        FROM ac a
        JOIN election_booths eb ON eb.ac_no = a.ac_no
        JOIN elections e ON e.election_id = eb.election_id
        LEFT JOIN booth_results br ON br.booth_id = eb.booth_id
        WHERE a.district_code = $1 AND e.election_year = $2
        GROUP BY a.ac_no, a.geojson_name, a.name
        ORDER BY a.ac_no ASC
    """, district_code, election_year)

    ac_list = []
    for r in ac_rows:
        polled = r["votes_polled"]
        p_dict = {"BJP": r["bjp"], "RLD": r["rld"], "SP": r["sp"], "BSP": r["bsp"]}
        winner, win_v = max(p_dict.items(), key=lambda x: x[1]) if polled > 0 else ("N/A", 0)
        ac_list.append({
            "ac_no": r["ac_no"],
            "ac_name": r["ac_name"],
            "booths": r["booths"],
            "turnout_pct": round(100.0 * polled / r["electors"], 1) if r["electors"] > 0 else 0.0,
            "winner": winner if win_v > 0 else "N/A",
            "votes_polled": polled,
        })

    # Call telephony stats for this district
    calls = await pool.fetchrow("""
        SELECT 
            COUNT(*)::int AS total_calls,
            COUNT(CASE WHEN c.flag IN ('true', '1', 'yes', 'problem') THEN 1 END)::int AS issues_reported
        FROM public."call" c
        JOIN ac a ON a.ac_no = c.ac_no
        WHERE a.district_code = $1
    """, district_code)

    polled = agg["votes_polled"] if agg else 0
    electors = agg["electors"] if agg else 0

    return {
        "district_code": d_info["district_code"],
        "district_name": d_info["name"],
        "state_name": d_info["state_name"],
        "election_year": election_year,
        "total_acs": agg["total_acs"] if agg else len(ac_list),
        "total_booths": agg["total_booths"] if agg else 0,
        "electors": electors,
        "votes_polled": polled,
        "turnout_pct": round(100.0 * polled / electors, 2) if electors > 0 else 0.0,
        "party_totals": {
            "BJP": agg["bjp"] if agg else 0,
            "RLD": agg["rld"] if agg else 0,
            "SP": agg["sp"] if agg else 0,
            "BSP": agg["bsp"] if agg else 0,
        },
        "constituencies": ac_list,
        "call_stats": dict(calls) if calls else {},
    }


async def compare_elections(pool: Any, ac_identifier: str | int | None = None, district_identifier: str | int | None = None) -> dict[str, Any]:
    """Compare election results between 2017 and 2022 for an AC or an entire district."""
    if pool is None:
        return {"error": "Database connection not available"}

    if ac_identifier:
        ac_no = await _resolve_ac_no(pool, ac_identifier)
        if not ac_no:
            return {"error": f"Constituency '{ac_identifier}' not found."}

        ac_info = await pool.fetchrow("SELECT ac_no, COALESCE(geojson_name, name) AS name FROM ac WHERE ac_no = $1", ac_no)
        rows = await pool.fetch("""
            SELECT 
                e.election_year,
                COUNT(eb.booth_id)::int AS booths,
                COALESCE(SUM(br.electors), 0)::bigint AS electors,
                COALESCE(SUM(br.votes_polled), 0)::bigint AS votes_polled,
                COALESCE(SUM(br.votes_bjp), 0)::bigint AS bjp,
                COALESCE(SUM(br.votes_rld), 0)::bigint AS rld,
                COALESCE(SUM(br.votes_samajwadi), 0)::bigint AS sp,
                COALESCE(SUM(br.votes_bsp), 0)::bigint AS bsp,
                COALESCE(SUM(br.votes_inc), 0)::bigint AS inc
            FROM election_booths eb
            JOIN elections e ON e.election_id = eb.election_id
            LEFT JOIN booth_results br ON br.booth_id = eb.booth_id
            WHERE eb.ac_no = $1
            GROUP BY e.election_year
            ORDER BY e.election_year ASC
        """, ac_no)

        years_data = {}
        for r in rows:
            polled = r["votes_polled"]
            p_dict = {"BJP": r["bjp"], "RLD": r["rld"], "SP": r["sp"], "BSP": r["bsp"], "INC": r["inc"]}
            winner, win_v = max(p_dict.items(), key=lambda x: x[1]) if polled > 0 else ("N/A", 0)
            years_data[r["election_year"]] = {
                "booths": r["booths"],
                "electors": r["electors"],
                "votes_polled": polled,
                "turnout_pct": round(100.0 * polled / r["electors"], 2) if r["electors"] > 0 else 0.0,
                "winner": winner if win_v > 0 else "N/A",
                "party_votes": {k: v for k, v in p_dict.items() if v > 0},
                "party_shares": {k: round(100.0 * v / polled, 2) for k, v in p_dict.items() if polled > 0 and v > 0},
            }

        return {
            "comparison_type": "assembly",
            "ac_no": ac_no,
            "ac_name": ac_info["name"] if ac_info else str(ac_no),
            "years": years_data,
        }

    # Compare focus districts overall
    return {"error": "Please provide an AC name or number to compare (e.g. 'Baghpat', 'Nakur', 'Behat')."}


async def get_top_constituencies(
    pool: Any,
    metric: str = "turnout",
    order: str = "desc",
    limit: int = 5,
    election_year: int = 2022,
) -> list[dict[str, Any]]:
    """Get top or bottom constituencies ranked by a metric (turnout, bjp_share, rld_share, sp_share, margin)."""
    if pool is None:
        return []

    limit = max(1, min(limit, 20))
    sort_dir = "DESC" if order.lower() == "desc" else "ASC"

    metric_expressions = {
        "turnout": "ROUND(100.0 * SUM(br.votes_polled) / NULLIF(SUM(br.electors), 0), 2)",
        "bjp_share": "ROUND(100.0 * SUM(br.votes_bjp) / NULLIF(SUM(br.votes_polled), 0), 2)",
        "rld_share": "ROUND(100.0 * SUM(br.votes_rld) / NULLIF(SUM(br.votes_polled), 0), 2)",
        "sp_share": "ROUND(100.0 * SUM(br.votes_samajwadi) / NULLIF(SUM(br.votes_polled), 0), 2)",
        "bsp_share": "ROUND(100.0 * SUM(br.votes_bsp) / NULLIF(SUM(br.votes_polled), 0), 2)",
        "votes_polled": "SUM(br.votes_polled)",
        "booth_count": "COUNT(eb.booth_id)",
    }

    sort_expr = metric_expressions.get(metric.lower(), metric_expressions["turnout"])

    rows = await pool.fetch(f"""
        SELECT a.ac_no,
               COALESCE(a.geojson_name, a.name) AS ac_name,
               d.name AS district_name,
               COUNT(eb.booth_id)::int AS booth_count,
               SUM(br.electors)::bigint AS electors,
               SUM(br.votes_polled)::bigint AS votes_polled,
               SUM(br.votes_bjp)::bigint AS bjp_votes,
               SUM(br.votes_rld)::bigint AS rld_votes,
               SUM(br.votes_samajwadi)::bigint AS sp_votes,
               ROUND(100.0 * SUM(br.votes_polled) / NULLIF(SUM(br.electors), 0), 2) AS turnout_pct,
               {sort_expr} AS metric_value
        FROM ac a
        JOIN districts d ON d.district_code = a.district_code
        JOIN election_booths eb ON eb.ac_no = a.ac_no
        JOIN elections e ON e.election_id = eb.election_id
        LEFT JOIN booth_results br ON br.booth_id = eb.booth_id
        WHERE e.election_year = $1
        GROUP BY a.ac_no, a.geojson_name, a.name, d.name
        HAVING SUM(br.electors) > 1000
        ORDER BY {sort_expr} {sort_dir} NULLS LAST
        LIMIT $2
    """, election_year, limit)

    return [dict(r) for r in rows]


async def get_call_analytics(pool: Any, ac_identifier: str | int | None = None, district_identifier: str | int | None = None) -> dict[str, Any]:
    """Get telephony & citizen feedback metrics, category breakdown, and issue rates."""
    if pool is None:
        return {"error": "Database connection not available"}

    filter_clause = "WHERE 1=1"
    params: list[Any] = []
    scope_name = "Statewide (All Covered Areas)"

    if ac_identifier:
        ac_no = await _resolve_ac_no(pool, ac_identifier)
        if ac_no:
            params.append(ac_no)
            filter_clause += f" AND c.ac_no = ${len(params)}"
            ac_name = await pool.fetchval("SELECT COALESCE(geojson_name, name) FROM ac WHERE ac_no = $1", ac_no)
            scope_name = f"AC #{ac_no} ({ac_name})"

    elif district_identifier:
        d_code = await _resolve_district_code(pool, district_identifier)
        if d_code:
            params.append(d_code)
            filter_clause += f" AND a.district_code = ${len(params)}"
            d_name = await pool.fetchval("SELECT name FROM districts WHERE district_code = $1", d_code)
            scope_name = f"District {d_name}"

    overall = await pool.fetchrow(f"""
        SELECT 
            COUNT(*)::int AS total_calls,
            COUNT(CASE WHEN c.flag IN ('true', '1', 'yes', 'problem') THEN 1 END)::int AS issues_reported,
            COUNT(CASE WHEN c.flag NOT IN ('true', '1', 'yes', 'problem') OR c.flag IS NULL THEN 1 END)::int AS clear_calls,
            COUNT(DISTINCT c.ac_no)::int AS acs_covered,
            COUNT(DISTINCT c.sid)::int AS unique_contacts_called
        FROM public."call" c
        LEFT JOIN ac a ON a.ac_no = c.ac_no
        {filter_clause}
    """, *params)

    tot = overall["total_calls"] if overall else 0
    iss = overall["issues_reported"] if overall else 0
    issue_pct = round(100.0 * iss / tot, 2) if tot > 0 else 0.0

    categories = await pool.fetch(f"""
        SELECT COALESCE(NULLIF(TRIM(c.category), ''), 'General / Uncategorized') AS category,
               COUNT(*)::int AS count
        FROM public."call" c
        LEFT JOIN ac a ON a.ac_no = c.ac_no
        {filter_clause}
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 10
    """, *params)

    return {
        "scope": scope_name,
        "total_calls": tot,
        "issues_reported": iss,
        "clear_calls": overall["clear_calls"] if overall else 0,
        "issue_rate_percent": issue_pct,
        "unique_contacts": overall["unique_contacts_called"] if overall else 0,
        "category_distribution": [dict(c) for c in categories],
    }


async def get_recent_calls(
    pool: Any,
    ac_identifier: str | int | None = None,
    only_issues: bool = True,
    limit: int = 8,
) -> list[dict[str, Any]]:
    """Get the most recent call logs or voter grievance reports."""
    if pool is None:
        return []

    conditions = []
    params: list[Any] = []

    if only_issues:
        conditions.append("c.flag IN ('true', '1', 'yes', 'problem')")

    if ac_identifier:
        ac_no = await _resolve_ac_no(pool, ac_identifier)
        if ac_no:
            params.append(ac_no)
            conditions.append(f"c.ac_no = ${len(params)}")

    where_str = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.append(limit)

    rows = await pool.fetch(f"""
        SELECT c.cid,
               c.created_at,
               c.category,
               c.summary,
               c.feedback,
               c.flag,
               COALESCE(a.geojson_name, a.name) AS ac_name,
               c.ac_no,
               v.name AS village_name
        FROM public."call" c
        LEFT JOIN ac a ON a.ac_no = c.ac_no
        LEFT JOIN villages v ON v.village_id = c.village_id
        {where_str}
        ORDER BY c.created_at DESC, c.cid DESC
        LIMIT ${len(params)}
    """, *params)

    res = []
    for r in rows:
        dt_str = r["created_at"].strftime("%d %b %Y, %H:%M") if r["created_at"] else "Recent"
        res.append({
            "cid": r["cid"],
            "date": dt_str,
            "category": r["category"] or "General",
            "summary": r["summary"] or "Call record",
            "feedback": r["feedback"] or "",
            "ac_name": r["ac_name"] or f"AC {r['ac_no']}",
            "village_name": r["village_name"] or "N/A",
            "has_issue": r["flag"] in ("true", "1", "yes", "problem"),
        })
    return res


async def get_booth_and_village_data(
    pool: Any,
    ac_identifier: str | int,
    village_name: str | None = None,
    limit: int = 15,
    election_year: int = 2022,
) -> list[dict[str, Any]]:
    """Get booth-level votes, turnout, and village mapping for an Assembly Constituency."""
    if pool is None:
        return []

    ac_no = await _resolve_ac_no(pool, ac_identifier)
    if not ac_no:
        return []

    conditions = ["eb.ac_no = $1", "e.election_year = $2"]
    params: list[Any] = [ac_no, election_year]

    if village_name and village_name.strip():
        params.append(f"%{village_name.strip().lower()}%")
        conditions.append(f"LOWER(v.name) LIKE ${len(params)}")

    params.append(min(limit, 50))

    rows = await pool.fetch(f"""
        SELECT eb.booth_no,
               COALESCE(v.name, 'Unassigned') AS village_name,
               ps.name AS polling_station_name,
               br.electors,
               br.votes_polled,
               br.votes_bjp,
               br.votes_rld,
               br.votes_samajwadi,
               ROUND(100.0 * br.votes_polled / NULLIF(br.electors, 0), 1) AS turnout_pct
        FROM election_booths eb
        JOIN elections e ON e.election_id = eb.election_id
        LEFT JOIN booth_results br ON br.booth_id = eb.booth_id
        LEFT JOIN villages v ON v.village_id = eb.village_id
        LEFT JOIN polling_stations ps ON ps.ps_id = eb.ps_id
        WHERE {' AND '.join(conditions)}
        ORDER BY eb.booth_no::int NULLS LAST, eb.booth_no ASC
        LIMIT ${len(params)}
    """, *params)

    return [dict(r) for r in rows]


async def get_top_villages_by_party(
    pool: Any,
    party: str = "RLD",
    metric: str = "vote_share",
    ac_identifier: str | int | None = None,
    district_identifier: str | int | None = None,
    election_year: int | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Rank top villages where a specific party (RLD, BJP, SP, BSP, INC) is strongest, most consistent, or polled highest."""
    if pool is None:
        return []

    party_map = {
        "bjp": "votes_bjp",
        "rld": "votes_rld",
        "sp": "votes_samajwadi",
        "samajwadi": "votes_samajwadi",
        "bsp": "votes_bsp",
        "inc": "votes_inc",
        "congress": "votes_inc",
        "aap": "votes_aap",
        "aimim": "votes_aimim",
        "asp": "votes_asp",
    }
    col = party_map.get(party.strip().lower(), "votes_rld")
    sort_expr = f"LEAST(100.0, ROUND(100.0 * SUM(br.{col}) / NULLIF(SUM(br.votes_polled), 0), 2))" if metric == "vote_share" else f"SUM(br.{col})"

    conditions = ["br.votes_polled > 0"]
    params: list[Any] = []

    if election_year:
        params.append(election_year)
        conditions.append(f"e.election_year = ${len(params)}")

    if ac_identifier:
        ac_no = await _resolve_ac_no(pool, ac_identifier)
        if ac_no:
            params.append(ac_no)
            conditions.append(f"eb.ac_no = ${len(params)}")

    if district_identifier:
        d_code = await _resolve_district_code(pool, district_identifier)
        if d_code:
            params.append(d_code)
            conditions.append(f"d.district_code = ${len(params)}")

    where_clause = f"WHERE {' AND '.join(conditions)}"
    params.append(max(1, min(limit, 20)))

    rows = await pool.fetch(f"""
        SELECT 
            v.village_id,
            v.name AS village_name,
            a.ac_no,
            COALESCE(a.geojson_name, a.name) AS ac_name,
            d.name AS district_name,
            COUNT(DISTINCT eb.booth_id)::int AS booths_count,
            COUNT(DISTINCT e.election_year)::int AS election_years_count,
            STRING_AGG(DISTINCT e.election_year::text, ', ') AS years_recorded,
            COALESCE(SUM(br.electors), 0)::bigint AS total_electors,
            COALESCE(SUM(br.votes_polled), 0)::bigint AS votes_polled,
            COALESCE(SUM(br.{col}), 0)::bigint AS party_votes,
            LEAST(100.0, ROUND(100.0 * SUM(br.{col}) / NULLIF(SUM(br.votes_polled), 0), 2)) AS party_share_pct
        FROM villages v
        JOIN election_booths eb ON eb.village_id = v.village_id
        JOIN elections e ON e.election_id = eb.election_id
        JOIN ac a ON a.ac_no = eb.ac_no
        JOIN districts d ON d.district_code = a.district_code
        LEFT JOIN booth_results br ON br.booth_id = eb.booth_id
        {where_clause}
        GROUP BY v.village_id, v.name, a.ac_no, a.geojson_name, a.name, d.name
        HAVING SUM(br.votes_polled) >= 300
        ORDER BY {sort_expr} DESC NULLS LAST, party_votes DESC
        LIMIT ${len(params)}
    """, *params)

    return [dict(r) for r in rows]


async def execute_analytical_sql(pool: Any, sql_query: str) -> dict[str, Any]:
    """Execute a safe, read-only SELECT SQL query against the database for custom aggregations."""
    if pool is None:
        return {"error": "Database connection not available"}

    clean = sql_query.strip()
    # Security guard: Must begin with SELECT or WITH and forbid mutations
    if not re.match(r"^(SELECT|WITH)\b", clean, re.IGNORECASE):
        return {"error": "Only read-only SELECT or WITH queries are permitted."}

    forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "GRANT", "REVOKE"]
    for word in forbidden:
        if re.search(rf"\b{word}\b", clean, re.IGNORECASE):
            return {"error": f"Operation '{word}' is strictly prohibited."}

    # Ensure limit
    if "LIMIT" not in clean.upper():
        clean += " LIMIT 25"

    try:
        rows = await pool.fetch(clean)
        return {
            "row_count": len(rows),
            "rows": [dict(r) for r in rows],
        }
    except Exception as e:
        return {"error": f"SQL query failed: {str(e)}"}


# ============================================================================
# TOOL REGISTRY & FUNCTION CALLING DEFINITIONS
# ============================================================================

AVAILABLE_TOOLS = {
    "get_database_overview": {
        "fn": get_database_overview,
        "description": "Get high-level summary metrics of all data in the electoral intelligence database (total ACs, booths, calls, contacts, election years).",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    "list_districts": {
        "fn": list_districts,
        "description": "List districts with their AC count, booth count, and whether they belong to the 16 primary focused districts.",
        "parameters": {
            "type": "object",
            "properties": {
                "focus_only": {"type": "boolean", "description": "Whether to return only the 16 focus districts or all 75 UP districts"}
            },
        },
    },
    "search_assemblies": {
        "fn": search_assemblies,
        "description": "Search for assembly constituencies by name or AC number, or list ACs under a specific district.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "AC name or number, e.g. 'Meerut' or '52' or 'Baghpat'"},
                "district_query": {"type": "string", "description": "Optional district name or code to filter by, e.g. 'Baghpat'"},
            },
        },
    },
    "get_assembly_details": {
        "fn": get_assembly_details,
        "description": "Get comprehensive election results, party vote counts, shares, winner, margin, turnout, booth count, and call feedback for a specific assembly constituency.",
        "parameters": {
            "type": "object",
            "properties": {
                "ac_identifier": {"type": "string", "description": "AC number (e.g. '52') or AC name (e.g. 'Baghpat', 'Meerut Cantt', 'Sardhana')"},
                "election_year": {"type": "integer", "description": "Election year (2022 or 2017), defaults to 2022"},
            },
            "required": ["ac_identifier"],
        },
    },
    "get_district_summary": {
        "fn": get_district_summary,
        "description": "Get aggregated election metrics, party totals, and the list of all ACs with winners for an entire district.",
        "parameters": {
            "type": "object",
            "properties": {
                "district_identifier": {"type": "string", "description": "District name (e.g. 'Meerut', 'Baghpat', 'Bulandshahr') or district code"},
                "election_year": {"type": "integer", "description": "Election year, defaults to 2022"},
            },
            "required": ["district_identifier"],
        },
    },
    "compare_elections": {
        "fn": compare_elections,
        "description": "Compare historical results between the 2017 and 2022 elections for an Assembly Constituency (turnout changes, vote share swings, seat flips).",
        "parameters": {
            "type": "object",
            "properties": {
                "ac_identifier": {"type": "string", "description": "AC name or number to compare (e.g. 'Deoband', 'Nakur', 'Baghpat')"},
            },
            "required": ["ac_identifier"],
        },
    },
    "get_top_constituencies": {
        "fn": get_top_constituencies,
        "description": "Get top or bottom constituencies ranked by turnout, vote shares of parties (BJP, RLD, SP, BSP), or booth counts.",
        "parameters": {
            "type": "object",
            "properties": {
                "metric": {
                    "type": "string",
                    "description": "Metric to rank by: 'turnout', 'bjp_share', 'rld_share', 'sp_share', 'bsp_share', 'votes_polled', 'booth_count'",
                },
                "order": {"type": "string", "enum": ["desc", "asc"], "description": "Sort order: 'desc' for highest, 'asc' for lowest"},
                "limit": {"type": "integer", "description": "Number of results to return (1-20, default 5)"},
                "election_year": {"type": "integer", "description": "Election year (default 2022)"},
            },
        },
    },
    "get_call_analytics": {
        "fn": get_call_analytics,
        "description": "Get telephony metrics, total calls, citizen grievance rates, and breakdown by problem category for a constituency, district, or statewide.",
        "parameters": {
            "type": "object",
            "properties": {
                "ac_identifier": {"type": "string", "description": "Optional AC name or number"},
                "district_identifier": {"type": "string", "description": "Optional district name or code"},
            },
        },
    },
    "get_recent_calls": {
        "fn": get_recent_calls,
        "description": "Get recent telephony call records and voter issue logs with summaries, categories, and village attributions.",
        "parameters": {
            "type": "object",
            "properties": {
                "ac_identifier": {"type": "string", "description": "Optional AC name or number to filter by"},
                "only_issues": {"type": "boolean", "description": "If true, only return calls where an issue or problem was flagged"},
                "limit": {"type": "integer", "description": "Number of recent calls to retrieve (default 8)"},
            },
        },
    },
    "get_booth_and_village_data": {
        "fn": get_booth_and_village_data,
        "description": "Get booth-level polling results and village mappings for a constituency.",
        "parameters": {
            "type": "object",
            "properties": {
                "ac_identifier": {"type": "string", "description": "AC name or number"},
                "village_name": {"type": "string", "description": "Optional village name to filter booths"},
                "limit": {"type": "integer", "description": "Limit of booth rows to return (default 15)"},
                "election_year": {"type": "integer", "description": "Election year (default 2022)"},
            },
            "required": ["ac_identifier"],
        },
    },
    "get_top_villages_by_party": {
        "fn": get_top_villages_by_party,
        "description": "Find and rank top villages where a specific political party (RLD, BJP, SP, BSP, INC) is strongest, most consistent, or polled the highest vote share. When asked for 'consistent' villages or overall strongholds, leave election_year as null to compute across all election cycles.",
        "parameters": {
            "type": "object",
            "properties": {
                "party": {"type": "string", "description": "Party abbreviation: 'RLD', 'BJP', 'SP', 'BSP', 'INC' (default 'RLD')"},
                "metric": {"type": "string", "enum": ["vote_share", "total_votes"], "description": "Rank by 'vote_share' (highest percentage) or 'total_votes'"},
                "ac_identifier": {"type": "string", "description": "Optional AC name or number to filter by"},
                "district_identifier": {"type": "string", "description": "Optional district name or code to filter by"},
                "election_year": {"type": "integer", "description": "Optional election year (e.g. 2022 or 2017). Omit or set null to compute across all available election cycles for consistency"},
                "limit": {"type": "integer", "description": "Number of top villages to return (default 5)"},
            },
        },
    },
    "execute_analytical_sql": {
        "fn": execute_analytical_sql,
        "description": "Execute a custom read-only SELECT SQL query for complex or unmapped electoral inquiries.",
        "parameters": {
            "type": "object",
            "properties": {
                "sql_query": {"type": "string", "description": "Read-only SQL query beginning with SELECT"},
            },
            "required": ["sql_query"],
        },
    },
}


# ============================================================================
# LLM AGENT RUNNER (GEMINI / OPENAI)
# ============================================================================

SYSTEM_PROMPT = """You are the Electoral Intelligence AI Analyst.
You are an expert political, electoral, and demographic analyst assisting users exploring election results and ground sentiment data across Uttar Pradesh.

You have direct access to tools that query the live database:
- Top villages by party vote share/performance (`get_top_villages_by_party`)
- Assembly constituencies & election results (BJP, RLD, SP, BSP, INC, margins, turnout %, winner)
- 2017 vs 2022 historical comparison & vote swings
- District summaries for 16 focus districts and 403 ACs statewide
- Granular booth results and village mappings
- Telephony call grievances (real-time citizen reports and ground feedback)
- Read-only custom SQL analytics (`execute_analytical_sql`)

DATABASE SCHEMA & JOIN RELATIONSHIPS (CRITICAL FOR CUSTOM SQL):
- ac: ac_no (BIGINT PK), name (TEXT), district_code (INTEGER FK -> districts.district_code), geojson_name
- districts: district_code (INTEGER PK), name (TEXT), state_name (TEXT)
- elections: election_id (BIGINT PK), election_year (INTEGER: 2017, 2022), election_type (TEXT)
- election_booths: booth_id (BIGINT PK), election_id (BIGINT FK -> elections.election_id), ac_no (BIGINT FK -> ac.ac_no), booth_no (TEXT), village_id (BIGINT FK -> villages.village_id), ps_id (BIGINT FK -> polling_stations.ps_id)
- booth_results: booth_id (BIGINT PK FK -> election_booths.booth_id), electors (BIGINT), votes_polled (BIGINT), valid_votes (BIGINT), votes_bjp, votes_rld, votes_samajwadi, votes_bsp, votes_inc, votes_aap, votes_aimim, votes_asp, votes_ind, votes_nota
  NOTE: booth_results does NOT have ac_no or village_id directly! You MUST join through election_booths:
  JOIN election_booths eb ON eb.booth_id = br.booth_id
  JOIN villages v ON v.village_id = eb.village_id
  JOIN ac a ON a.ac_no = eb.ac_no
  JOIN districts d ON d.district_code = a.district_code
- villages: village_id (BIGINT PK), ac_no (BIGINT), name (TEXT)
- polling_stations: ps_id (BIGINT PK), ac_no (BIGINT), name (TEXT)
- public."call": cid (BIGINT PK), sid (BIGINT), ac_no (BIGINT), village_id (BIGINT), summary (TEXT), category (TEXT), flag (TEXT: 'true'/'false'), feedback (TEXT), created_at (TIMESTAMPTZ)
- sampark_sutra: sid (BIGINT PK), ac_no (BIGINT), village_id (BIGINT), name (TEXT), phone (TEXT), caste (TEXT), age (SMALLINT)

Guidelines:
1. Always call the relevant tool first to fetch precise numbers. Never invent or hallucinate figures.
2. When asked about top or consistent villages for a party (e.g. 'top 5 villages where RLD has been consistent'), ALWAYS call `get_top_villages_by_party(party="RLD")`.
3. Provide natural, intelligent, conversational analysis: explain the context of margins (was it a nail-biter or a landslide?), discuss voter turnout implications, and cite specific numbers.
4. Be articulate, perceptive, and direct. Use GitHub Markdown with bold highlights, bullet points, and tables when comparing multiple entities.
5. Answer in the same language or tone as the user (English, Hindi, or Hinglish).
"""


def _gemini_tool_declaration() -> list[dict[str, Any]]:
    """Format tools for Google Gemini Function Calling."""
    declarations = []
    for name, tool in AVAILABLE_TOOLS.items():
        declarations.append({
            "name": name,
            "description": tool["description"],
            "parameters": tool["parameters"],
        })
    return [{"function_declarations": declarations}]


def _openai_tool_declaration() -> list[dict[str, Any]]:
    """Format tools for OpenAI Function Calling."""
    tools = []
    for name, tool in AVAILABLE_TOOLS.items():
        tools.append({
            "type": "function",
            "function": {
                "name": name,
                "description": tool["description"],
                "parameters": tool["parameters"],
            },
        })
    return tools


def _sanitize_for_json(obj: Any) -> Any:
    """Recursively convert Decimal, datetime, and other non-standard objects to JSON-serializable primitives."""
    if isinstance(obj, Decimal):
        return float(obj) if obj % 1 != 0 else int(obj)
    if isinstance(obj, (datetime, date, time)):
        return obj.isoformat()
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    if isinstance(obj, dict):
        return {str(k): _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_sanitize_for_json(x) for x in obj]
    return obj


async def _execute_tool_call(pool: Any, tool_name: str, args: dict[str, Any]) -> Any:
    """Execute a single tool by name with arguments."""
    tool = AVAILABLE_TOOLS.get(tool_name)
    if not tool:
        return {"error": f"Tool '{tool_name}' is not recognized"}

    fn = tool["fn"]
    try:
        # Pass pool as first argument
        result = await fn(pool, **args)
        return _sanitize_for_json(result)
    except Exception as exc:
        logger.exception("Error executing tool %s with args %s", tool_name, args)
        return {"error": f"Tool execution failed: {str(exc)}"}


async def _run_gemini_agent(
    pool: Any,
    api_key: str,
    user_message: str,
    history: list[dict[str, str]],
    context: dict[str, Any] | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """Execute LLM agent loop using Google Gemini API with fallback across healthy models."""
    candidate_models = ["gemini-2.5-flash", "gemini-3.1-flash-lite-preview"]
    headers = {"Content-Type": "application/json"}
    tools = _gemini_tool_declaration()
    tools_called = []

    # Prepare conversation contents
    contents = []
    for h in history[-6:]:
        role = "user" if h.get("role") == "user" else "model"
        contents.append({"role": role, "parts": [{"text": h.get("content", "")}]})

    prompt_with_context = user_message
    if context:
        ctx_bits = [f"{k}: {v}" for k, v in context.items() if v]
        if ctx_bits:
            prompt_with_context = f"[Context: {', '.join(ctx_bits)}]\nUser question: {user_message}"

    contents.append({"role": "user", "parts": [{"text": prompt_with_context}]})

    active_model = candidate_models[0]

    async with httpx.AsyncClient(timeout=45.0) as client:
        # Loop for function calling (up to 4 turns)
        for _ in range(4):
            payload = {
                "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                "contents": contents,
                "tools": tools,
            }

            resp = None
            last_err = ""
            for model_name in candidate_models:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                try:
                    resp = await client.post(url, headers=headers, json=payload)
                    if resp.status_code == 200:
                        active_model = model_name
                        break
                    last_err = f"Model {model_name} returned status {resp.status_code}: {resp.text}"
                    logger.warning("Gemini model %s failed (%s), checking next candidate", model_name, resp.status_code)
                except httpx.TimeoutException:
                    last_err = f"Model {model_name} timed out"
                    logger.warning("Gemini model %s timed out, trying fallback", model_name)
                    continue

            if resp is None or resp.status_code != 200:
                raise RuntimeError(last_err or "All Gemini model endpoints failed")

            data = resp.json()
            candidates = data.get("candidates", [])
            if not candidates:
                return "I could not generate an answer at this moment.", tools_called

            candidate = candidates[0]
            parts = candidate.get("content", {}).get("parts", [])

            # Check if model wants to call functions
            function_calls = [p["functionCall"] for p in parts if "functionCall" in p]
            if not function_calls:
                # Text answer generated
                text_parts = [p["text"] for p in parts if "text" in p]
                return "\n".join(text_parts), tools_called

            # Execute function calls
            contents.append({"role": "model", "parts": parts})
            response_parts = []
            for fc in function_calls:
                fn_name = fc.get("name")
                fn_args = fc.get("args", {})
                res = await _execute_tool_call(pool, fn_name, fn_args)
                tools_called.append({"tool": fn_name, "args": fn_args})
                response_parts.append({
                    "functionResponse": {
                        "name": fn_name,
                        "response": {"result": _sanitize_for_json(res)},
                    }
                })

            contents.append({"role": "user", "parts": response_parts})

        return "I completed retrieving the data, but exceeded max reasoning steps.", tools_called


async def _run_openai_compatible_agent(
    pool: Any,
    api_key: str,
    user_message: str,
    history: list[dict[str, str]],
    context: dict[str, Any] | None = None,
    base_url: str = "https://api.openai.com/v1/chat/completions",
    model: str = "gpt-4o-mini",
) -> tuple[str, list[dict[str, Any]]]:
    """Execute LLM agent loop using OpenAI-compatible API (OpenAI, Groq, OpenRouter, vLLM)."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    tools = _openai_tool_declaration()
    tools_called = []

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for h in history[-6:]:
        messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})

    prompt_with_context = user_message
    if context:
        ctx_bits = [f"{k}: {v}" for k, v in context.items() if v]
        if ctx_bits:
            prompt_with_context = f"[Context: {', '.join(ctx_bits)}]\nUser question: {user_message}"

    messages.append({"role": "user", "content": prompt_with_context})

    async with httpx.AsyncClient(timeout=35.0) as client:
        for _ in range(4):
            payload = {
                "model": model,
                "messages": messages,
                "tools": tools,
            }
            resp = await client.post(base_url, headers=headers, json=payload)
            if resp.status_code != 200:
                raise RuntimeError(f"LLM API ({model}) returned status {resp.status_code}: {resp.text}")

            data = resp.json()
            choice = data["choices"][0]
            msg = choice["message"]
            messages.append(msg)

            tool_calls = msg.get("tool_calls")
            if not tool_calls:
                return msg.get("content", ""), tools_called

            for tc in tool_calls:
                fn_name = tc["function"]["name"]
                fn_args = json.loads(tc["function"].get("arguments", "{}"))
                res = await _execute_tool_call(pool, fn_name, fn_args)
                tools_called.append({"tool": fn_name, "args": fn_args})
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(res, default=str),
                })

        return "Completed queries.", tools_called


# ============================================================================
# BUILT-IN SMART INTENT ENGINE (ZERO-KEY FALLBACK)
# ============================================================================

def _generate_fallback_response(
    intent: str,
    tool_name: str,
    args: dict[str, Any],
    data: Any,
) -> str:
    """Synthesizes structured, rich markdown responses from tool outputs."""
    if isinstance(data, dict) and "error" in data:
        return f"⚠️ **Could not complete query**: {data['error']}"

    if tool_name == "get_database_overview":
        m = data.get("metrics", {})
        years = ", ".join(str(y["election_year"]) for y in data.get("election_years", []))
        return (
            f"### 📊 Electoral Intelligence Database Overview\n\n"
            f"- **Elections Tracked**: {years} Uttar Pradesh Assembly Elections\n"
            f"- **Assembly Constituencies**: **{m.get('total_acs', 0):,}** ACs mapped\n"
            f"- **Districts**: **{m.get('total_districts', 0):,}** districts (with deep booth analytics across 16 focus districts)\n"
            f"- **Polling Booths Recorded**: **{m.get('total_booths', 0):,}** booths\n"
            f"- **Telephony Call Feedback**: **{m.get('total_calls', 0):,}** ground verification calls logged\n"
            f"- **Sampark Sutra Ground Contacts**: **{m.get('total_sampark_sutra_contacts', 0):,}** registered village/ward leads\n\n"
            f"> *The database contains comprehensive booth-level election returns, voter turnout ratios, margins, and real-time caller problem tracking.*"
        )

    if tool_name == "get_assembly_details":
        if "winner" not in data:
            return (
                f"### 📍 AC #{data.get('ac_no')}: {data.get('ac_name')}\n\n"
                f"- **District**: {data.get('district_name')}\n"
                f"- **Villages**: {data.get('village_count')}\n"
                f"- **Status**: {data.get('status', 'No voting results loaded')}"
            )

        w = data["winner"]
        shares = data.get("party_shares", {})
        shares_text = " · ".join([f"**{p}**: {s}%" for p, s in sorted(shares.items(), key=lambda x: -x[1])[:5]])

        call_info = ""
        c = data.get("call_stats", {})
        if c.get("total_calls"):
            call_info = (
                f"\n\n**📞 Voter Grievances & Telephony**:\n"
                f"- Total calls in AC: **{c.get('total_calls', 0):,}**\n"
                f"- Issues reported: **{c.get('issues_reported', 0):,}**\n"
                f"- Ground contacts contacted: **{c.get('unique_contacts_called', 0):,}**"
            )

        return (
            f"### 🗳️ {data['ac_name']} (AC #{data['ac_no']}) — {data['election_year']} Election\n\n"
            f"- **District**: {data['district_name']}, {data['state_name']}\n"
            f"- **Winner**: 🏆 **{w['party']}** with **{w['votes']:,}** votes ({w['share_percent']}%)\n"
            f"- **Runner-Up**: {w['runner_up']} with **{w['runner_up_votes']:,}** votes\n"
            f"- **Victory Margin**: **{w['margin_votes']:,}** votes ({w['margin_percent']}% margin)\n"
            f"- **Voter Turnout**: **{data['turnout_percent']}%** ({data['votes_polled']:,} polled out of {data['electors']:,} electors)\n"
            f"- **Booths & Coverage**: {data['booth_count']} polling booths across {data['village_count']} villages\n\n"
            f"**Party Vote Shares**:\n{shares_text}{call_info}"
        )

    if tool_name == "get_district_summary":
        tot_polled = data.get("votes_polled", 0)
        tot_electors = data.get("electors", 0)
        acs = data.get("constituencies", [])
        ac_lines = []
        for ac in acs[:8]:
            ac_lines.append(f"- **{ac['ac_name']}** (AC #{ac['ac_no']}): Winner **{ac['winner']}** (Turnout: {ac['turnout_pct']}%)")

        return (
            f"### 🏛️ {data['district_name']} District — {data['election_year']} Summary\n\n"
            f"- **Assembly Constituencies**: {data['total_acs']} ACs\n"
            f"- **Total Polling Booths**: {data['total_booths']:,}\n"
            f"- **Total Votes Polled**: **{tot_polled:,}** / {tot_electors:,} ({data['turnout_pct']}% turnout)\n\n"
            f"**Constituency Winners**:\n" + "\n".join(ac_lines) +
            (f"\n*(and {len(acs) - 8} more)*" if len(acs) > 8 else "")
        )

    if tool_name == "compare_elections":
        years = data.get("years", {})
        if not years:
            return "No historical comparison data found."
        y_keys = sorted(years.keys())
        lines = []
        for y in y_keys:
            yd = years[y]
            top_shares = ", ".join([f"{p}: {s}%" for p, s in list(yd.get("party_shares", {}).items())[:3]])
            lines.append(
                f"- **{y} Election**: Winner **{yd['winner']}** | Turnout: **{yd['turnout_pct']}%** | Votes Polled: **{yd['votes_polled']:,}**\n"
                f"  - Top Shares: {top_shares}"
            )
        return (
            f"### 📈 Historical Comparison: {data.get('ac_name')} (AC #{data.get('ac_no')})\n\n"
            + "\n".join(lines)
        )

    if tool_name == "get_top_constituencies":
        items = data if isinstance(data, list) else []
        if not items:
            return "No constituencies found for this criteria."
        lines = []
        for idx, item in enumerate(items, 1):
            lines.append(
                f"{idx}. **{item['ac_name']}** ({item['district_name']}, AC #{item['ac_no']}): "
                f"**{item['metric_value']}%** turnout ({item['votes_polled']:,} polled)"
            )
        return "### 🏆 Top Constituencies by Voter Turnout\n\n" + "\n".join(lines)

    if tool_name == "get_call_analytics":
        cats = data.get("category_distribution", [])
        cat_lines = [f"- **{c['category']}**: {c['count']:,} calls" for c in cats[:5]]
        return (
            f"### 📞 Telephony & Voter Feedback: {data.get('scope')}\n\n"
            f"- **Total Calls Logged**: **{data.get('total_calls', 0):,}**\n"
            f"- **Issues / Problems Flagged**: **{data.get('issues_reported', 0):,}** ({data.get('issue_rate_percent', 0)}% issue rate)\n"
            f"- **Clear Calls**: **{data.get('clear_calls', 0):,}**\n"
            f"- **Unique Ground Contacts Reached**: **{data.get('unique_contacts', 0):,}**\n\n"
            f"**Problem / Category Breakdown**:\n" + "\n".join(cat_lines)
        )

    if tool_name == "get_recent_calls":
        calls = data if isinstance(data, list) else []
        if not calls:
            return "No recent call issues found."
        lines = []
        for c in calls[:6]:
            status = "⚠️ Issue" if c.get("has_issue") else "✅ Clear"
            lines.append(
                f"- **{c['date']}** | {status} | **{c['ac_name']}** ({c['village_name']})\n"
                f"  - *Summary*: {c['summary']}\n"
                + (f"  - *Feedback*: {c['feedback']}\n" if c.get("feedback") else "")
            )
        return "### 📋 Recent Citizen / Voter Call Reports\n\n" + "\n".join(lines)

    if tool_name == "list_districts":
        dists = data if isinstance(data, list) else []
        lines = [f"- **{d['district_name']}**: {d['ac_count']} ACs, {d['booth_count']:,} booths" for d in dists[:16]]
        return "### 🗺️ Priority Districts in Database\n\n" + "\n".join(lines)

    if tool_name == "get_top_villages_by_party":
        items = data if isinstance(data, list) else []
        if not items:
            return "No village data found matching this criteria."
        party_name = str(args.get("party", "Party")).upper()
        lines = []
        for idx, item in enumerate(items, 1):
            lines.append(
                f"{idx}. **{item['village_name']}** ({item['ac_name']}, {item['district_name']}): "
                f"**{item['party_share_pct']}%** {party_name} share ({item['party_votes']:,} / {item['votes_polled']:,} polled across {item['booths_count']} booths)"
            )
        return f"### 🏘️ Top Villages for {party_name} by Vote Share\n\n" + "\n".join(lines)

    return f"```json\n{json.dumps(data, indent=2, default=str)}\n```"


async def _run_smart_intent_agent(
    pool: Any,
    user_message: str,
    context: dict[str, Any] | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """Smart intent matcher that executes database tools without needing an external LLM key."""
    msg = user_message.strip().lower()
    tools_called = []

    # 1. Database overview / summary questions
    if any(k in msg for k in ("database", "overview", "how many ac", "how many booth", "how much data", "what data do you have", "system stats")):
        res = await get_database_overview(pool)
        tools_called.append({"tool": "get_database_overview", "args": {}})
        return _generate_fallback_response("overview", "get_database_overview", {}, res), tools_called

    # 1b. Top / Strongest Villages for a party (e.g. "top 5 villages where rld has been consistent/strong")
    if ("village" in msg or "villages" in msg) and any(p in msg for p in ("rld", "bjp", "sp", "samajwadi", "bsp", "inc", "congress", "aap")):
        party_found = "RLD"
        for p in ("rld", "bjp", "sp", "samajwadi", "bsp", "inc", "congress", "aap"):
            if re.search(rf"\b{p}\b", msg):
                party_found = "SP" if p == "samajwadi" else ("INC" if p == "congress" else p.upper())
                break
        res = await get_top_villages_by_party(pool, party=party_found, limit=5, election_year=2022)
        tools_called.append({"tool": "get_top_villages_by_party", "args": {"party": party_found, "limit": 5}})
        return _generate_fallback_response("top_villages", "get_top_villages_by_party", {"party": party_found}, res), tools_called

    # 2. Top / Highest / Lowest Turnout / Leaderboard
    if (("turnout" in msg) and any(k in msg for k in ("highest", "top", "best", "lowest", "least", "bottom", "most", "leaderboard"))) or any(k in msg for k in ("top turnout", "highest turnout", "lowest turnout", "most votes", "top 5", "top ac", "best turnout")):
        order = "asc" if any(k in msg for k in ("lowest", "least", "bottom")) else "desc"
        res = await get_top_constituencies(pool, metric="turnout", order=order, limit=5, election_year=2022)
        tools_called.append({"tool": "get_top_constituencies", "args": {"metric": "turnout", "order": order, "limit": 5}})
        return _generate_fallback_response("top", "get_top_constituencies", {"metric": "turnout"}, res), tools_called

    # 3. Call reports / Citizen feedback / Grievance questions
    if any(k in msg for k in ("call", "telephony", "complaint", "issue", "problem", "grievance", "sampark")):
        if "recent" in msg or "latest" in msg or "last" in msg:
            ac_match = re.search(r"ac\s*#?\s*(\d+)", msg)
            ac_id = ac_match.group(1) if ac_match else (context.get("current_ac") if context else None)
            res = await get_recent_calls(pool, ac_identifier=ac_id, only_issues=True, limit=6)
            tools_called.append({"tool": "get_recent_calls", "args": {"ac_identifier": ac_id, "only_issues": True}})
            return _generate_fallback_response("recent_calls", "get_recent_calls", {}, res), tools_called
        else:
            res = await get_call_analytics(pool)
            tools_called.append({"tool": "get_call_analytics", "args": {}})
            return _generate_fallback_response("calls", "get_call_analytics", {}, res), tools_called

    # 4. Compare 2017 vs 2022
    if any(k in msg for k in ("compare", "2017 vs 2022", "difference", "swing", "history")):
        # Look for AC
        ac_match = re.search(r"ac\s*#?\s*(\d+)", msg)
        ac_id = ac_match.group(1) if ac_match else None
        if not ac_id and context and context.get("current_ac"):
            ac_id = context.get("current_ac")

        # Try to extract constituency name from common list
        if not ac_id:
            known_acs = ["baghpat", "deoband", "nakur", "behat", "sardhana", "meerut", "kithore", "siwalkhas", "kairana", "budhana"]
            for ac_name in known_acs:
                if ac_name in msg:
                    ac_id = ac_name
                    break

        if ac_id:
            res = await compare_elections(pool, ac_identifier=ac_id)
            tools_called.append({"tool": "compare_elections", "args": {"ac_identifier": ac_id}})
            return _generate_fallback_response("compare", "compare_elections", {"ac_identifier": ac_id}, res), tools_called

    # 5. List districts
    if any(k in msg for k in ("list district", "districts", "which district", "what district", "covered district")):
        res = await list_districts(pool, focus_only=True)
        tools_called.append({"tool": "list_districts", "args": {"focus_only": True}})
        return _generate_fallback_response("districts", "list_districts", {}, res), tools_called

    known_districts = [
        "meerut", "baghpat", "muzaffarnagar", "bulandshahr", "ghaziabad", "saharanpur", "moradabad", "mathura",
        "aligarh", "agra", "gautam buddha nagar", "shamli", "hapur", "hathras", "amroha", "bijnor"
    ]

    # 5. Check if query is explicitly asking about a district
    if "district" in msg:
        for d in known_districts:
            if d in msg:
                res = await get_district_summary(pool, district_identifier=d, election_year=2022)
                tools_called.append({"tool": "get_district_summary", "args": {"district_identifier": d, "election_year": 2022}})
                return _generate_fallback_response("district_summary", "get_district_summary", {"district_identifier": d}, res), tools_called

    # 6. Extract AC number or name
    ac_match = re.search(r"\b(?:ac\s*#?|constituency\s*#?|ac_no\s*)(\d+)\b", msg)
    ac_id = ac_match.group(1) if ac_match else None

    # Check for known AC names in message
    if not ac_id:
        known_acs = [
            "baghpat", "siwalkhas", "sardhana", "hastinapur", "kithore", "meerut cantt", "meerut", "meerut south",
            "chhaprauli", "baraut", "kairana", "thana bhawan", "shamli", "budhana", "charthawal", "purqazi",
            "khatoli", "muzaffarnagar", "nakur", "behat", "saharanpur nagar", "saharanpur", "deoband", "gangoh",
            "loni", "muradnagar", "sahibabad", "ghaziabad", "modi nagar", "dadri", "noida", "jewar", "agra cantt",
            "agra south", "agra north", "agra rural", "fatehpur sikri", "khair", "baroli", "atrauli", "aligarh",
            "mathura", "vrindavan", "hapur", "dholana", "garhia", "bijnor", "chandpur", "dhampur", "najibabad"
        ]
        for name in known_acs:
            if name in msg:
                ac_id = name
                break

    # If AC is found or context has it
    if ac_id or (context and context.get("current_ac") and any(k in msg for k in ("winner", "turnout", "votes", "who won", "results", "margin", "bjp", "sp", "rld", "bsp"))):
        target_ac = ac_id or context.get("current_ac")
        res = await get_assembly_details(pool, ac_identifier=target_ac, election_year=2022)
        tools_called.append({"tool": "get_assembly_details", "args": {"ac_identifier": target_ac, "election_year": 2022}})
        return _generate_fallback_response("ac_details", "get_assembly_details", {"ac_identifier": target_ac}, res), tools_called

    # 7. Check for District Name without explicit 'district' keyword
    for d in known_districts:
        if d in msg:
            res = await get_district_summary(pool, district_identifier=d, election_year=2022)
            tools_called.append({"tool": "get_district_summary", "args": {"district_identifier": d, "election_year": 2022}})
            return _generate_fallback_response("district_summary", "get_district_summary", {"district_identifier": d}, res), tools_called

    # 8. Default fallback: search assemblies or show overview
    res = await get_database_overview(pool)
    tools_called.append({"tool": "get_database_overview", "args": {}})
    response_text = (
        f"I can answer election results, turnout numbers, party margins, and voter grievances for any Uttar Pradesh constituency or district.\n\n"
        + _generate_fallback_response("overview", "get_database_overview", {}, res)
    )
    return response_text, tools_called


# ============================================================================
# MAIN AGENT INTERFACE
# ============================================================================

def _generate_suggestions(user_message: str, tools_called: list[dict[str, Any]]) -> list[str]:
    """Generate dynamic follow-up suggestions based on context."""
    tool_names = [t["tool"] for t in tools_called]
    if "get_assembly_details" in tool_names:
        ac_name = ""
        for t in tools_called:
            if t["tool"] == "get_assembly_details":
                ac_name = str(t.get("args", {}).get("ac_identifier", ""))
                break
        return [
            f"Compare {ac_name or 'this AC'} between 2017 and 2022",
            f"What voter call complaints were logged in {ac_name or 'this AC'}?",
            f"Show booth-level results for {ac_name or 'this AC'}",
            "Which AC had the highest turnout in UP?",
        ]

    if "get_district_summary" in tool_names:
        return [
            "Which party won the most seats in this district?",
            "What were the call issues reported across this district?",
            "Show top 5 ACs by voter turnout",
            "Compare 2017 vs 2022 election results",
        ]

    if "get_call_analytics" in tool_names or "get_recent_calls" in tool_names:
        return [
            "Show recent issue calls for Baghpat",
            "Which ACs reported the highest number of problems?",
            "Show Meerut Cantt election results",
            "Give me a database overview",
        ]

    return [
        "Who won in Baghpat (AC 52) in 2022?",
        "Show voter complaints and call statistics",
        "Compare 2017 vs 2022 results for Deoband",
        "Top 5 constituencies by voter turnout",
    ]


async def answer_question(
    pool: Any,
    user_message: str,
    history: list[dict[str, str]] | None = None,
    context: dict[str, Any] | None = None,
    api_key: str | None = None,
    provider: str | None = None,
) -> dict[str, Any]:
    """Main entrypoint for the AI Agent."""
    history = history or []

    # Priority 1: request-provided key, Priority 2: environment keys
    gemini_key = (api_key if provider == "gemini" else None) or os.getenv("GEMINI_API_KEY")
    groq_key = (api_key if provider == "groq" else None) or os.getenv("GROQ_API_KEY")
    openai_key = (api_key if provider == "openai" else None) or os.getenv("OPENAI_API_KEY")

    # Auto-detect if key is passed without explicit provider
    if api_key and not provider:
        if api_key.startswith("AIza"):
            gemini_key = api_key
        elif api_key.startswith("gsk_"):
            groq_key = api_key
        elif api_key.startswith("sk-"):
            openai_key = api_key

    tools_called = []
    mode = "smart_database_agent"

    if gemini_key:
        try:
            reply, tools_called = await _run_gemini_agent(pool, gemini_key, user_message, history, context)
            mode = "gemini_llm"
        except Exception as exc:
            logger.warning("Gemini Agent failed: %s, falling back to rule agent", exc)
            reply, tools_called = await _run_smart_intent_agent(pool, user_message, context)
            mode = "fallback_database_agent"
            reply += f"\n\n> ⚠️ *LLM call failed ({exc}); showed direct DB response.*"
    elif groq_key:
        try:
            reply, tools_called = await _run_openai_compatible_agent(
                pool, groq_key, user_message, history, context,
                base_url="https://api.groq.com/openai/v1/chat/completions",
                model="llama-3.3-70b-versatile",
            )
            mode = "groq_llm"
        except Exception as exc:
            logger.warning("Groq Agent failed: %s, falling back to rule agent", exc)
            reply, tools_called = await _run_smart_intent_agent(pool, user_message, context)
            mode = "fallback_database_agent"
            reply += f"\n\n> ⚠️ *LLM call failed ({exc}); showed direct DB response.*"
    elif openai_key:
        try:
            base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1/chat/completions")
            model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
            reply, tools_called = await _run_openai_compatible_agent(
                pool, openai_key, user_message, history, context,
                base_url=base_url,
                model=model,
            )
            mode = "openai_llm"
        except Exception as exc:
            logger.warning("OpenAI Agent failed: %s, falling back to rule agent", exc)
            reply, tools_called = await _run_smart_intent_agent(pool, user_message, context)
            mode = "fallback_database_agent"
            reply += f"\n\n> ⚠️ *LLM call failed ({exc}); showed direct DB response.*"
    else:
        reply, tools_called = await _run_smart_intent_agent(pool, user_message, context)
        mode = "smart_database_agent"
        # Add a friendly badge indicating how to activate the neural LLM
        reply += (
            "\n\n---\n"
            "> ⚡ **Mode: Direct DB Engine (No LLM key configured)**\n"
            "> *To activate conversational AI reasoning, add a free **GEMINI_API_KEY** or **GROQ_API_KEY** in `backend/.env` or in the chat settings.*"
        )

    suggestions = _generate_suggestions(user_message, tools_called)

    return {
        "reply": reply,
        "tools_called": tools_called,
        "suggested_questions": suggestions,
        "mode": mode,
    }
