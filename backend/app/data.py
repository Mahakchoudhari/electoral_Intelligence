"""PostGIS dashboard queries and file-backed state boundaries."""

from __future__ import annotations

import json
import os
import csv
from pathlib import Path
from typing import Any

csv.field_size_limit(10_000_000)


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _configured_path(name: str, default: Path) -> Path:
    path = Path(os.getenv(name, default))
    return path if path.is_absolute() else (PROJECT_ROOT / path).resolve()


STATES_FILE = _configured_path(
    "GIS_STATES_FILE", PROJECT_ROOT / "INDIA" / "INDIA_STATES.geojson"
)
SPECIAL_DISTRICTS_FILE = _configured_path(
    "GIS_SPECIAL_DISTRICTS_FILE",
    Path(__file__).resolve().parent / "data_files" / "up_selected_16_districts.geojson",
)


def _load_geojson(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(f"GIS data file not found: {path}")
    if path.suffix.lower() == ".csv":
        with path.open(encoding="utf-8-sig", newline="") as source:
            features = []
            for row in csv.DictReader(source):
                geometry_text = row.pop("_geometry_geojson", None)
                row.pop("_geometry_type", None)
                if not geometry_text:
                    continue
                features.append({
                    "type": "Feature",
                    "geometry": json.loads(geometry_text),
                    "properties": {key: value for key, value in row.items() if value not in (None, "")},
                })
        return {"type": "FeatureCollection", "features": features}
    with path.open(encoding="utf-8") as source:
        data = json.load(source)
    if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
        raise ValueError(f"Invalid GeoJSON FeatureCollection: {path}")
    return data


async def states(pool: Any = None, election_year: int | None = None) -> dict[str, Any]:
    states_data = _load_geojson(STATES_FILE)
    if pool is None:
        return states_data
    try:
        rows = await pool.fetch("""
            WITH latest_elec AS (
                SELECT e.election_id, e.election_year
                FROM elections e
                WHERE ($1::int IS NULL OR e.election_year = $1)
                ORDER BY e.election_year DESC, e.election_id DESC
                LIMIT 1
            )
            SELECT UPPER(TRIM(d.state_name)) AS state_name,
                   COALESCE(SUM(br.electors), 0)::bigint AS electors,
                   COALESCE(SUM(br.votes_polled), 0)::bigint AS votes_polled,
                   COALESCE(SUM(br.votes_bjp), 0)::bigint AS votes_bjp,
                   COALESCE(SUM(br.votes_rld), 0)::bigint AS votes_rld,
                   COALESCE(SUM(br.votes_samajwadi), 0)::bigint AS votes_sp,
                   COALESCE(SUM(br.votes_bsp), 0)::bigint AS votes_bsp,
                   COALESCE(SUM(br.votes_inc), 0)::bigint AS votes_inc,
                   COALESCE(SUM(br.votes_aap), 0)::bigint AS votes_aap,
                   COALESCE(SUM(br.votes_aimim), 0)::bigint AS votes_aimim,
                   COALESCE(SUM(br.votes_asp), 0)::bigint AS votes_asp,
                   COALESCE(SUM(br.votes_ind), 0)::bigint AS votes_ind
            FROM districts d
            JOIN ac a ON a.district_code = d.district_code
            JOIN election_booths eb ON eb.ac_no = a.ac_no
            JOIN latest_elec le ON le.election_id = eb.election_id
            LEFT JOIN booth_results br ON br.booth_id = eb.booth_id
            WHERE d.state_name IS NOT NULL
            GROUP BY UPPER(TRIM(d.state_name))
        """, election_year)
        state_stats = {}
        for row in rows:
            polled = row["votes_polled"] or 0
            party_votes = {
                "BJP": row["votes_bjp"] or 0,
                "RLD": row["votes_rld"] or 0,
                "SP": row["votes_sp"] or 0,
                "BSP": row["votes_bsp"] or 0,
                "INC": row["votes_inc"] or 0,
                "AAP": row["votes_aap"] or 0,
                "AIMIM": row["votes_aimim"] or 0,
                "ASP": row["votes_asp"] or 0,
                "IND": row["votes_ind"] or 0,
            }
            party_shares = {
                p: round(100.0 * cnt / polled, 2) if polled > 0 else 0.0
                for p, cnt in party_votes.items()
            }
            sorted_parties = sorted(party_votes.items(), key=lambda item: -item[1])
            winner = sorted_parties[0][0] if sorted_parties and sorted_parties[0][1] > 0 else None
            state_stats[row["state_name"]] = {
                "electors": row["electors"] or 0,
                "votes_polled": polled,
                "party_votes": party_votes,
                "party_shares": party_shares,
                "winner": winner,
            }

        features = []
        for feature in states_data.get("features", []):
            props = dict(feature.get("properties") or {})
            sname = (props.get("STNAME") or props.get("ST_NAME") or props.get("state_name") or props.get("STATE") or "").strip().upper()
            if sname in state_stats:
                props.update(state_stats[sname])
            else:
                props["party_shares"] = {}
                props["party_votes"] = {}
                props["winner"] = None
                props["votes_polled"] = 0
                props["electors"] = 0
            features.append({**feature, "properties": props})
        return {**states_data, "features": features}
    except Exception as exc:
        print("Error enriching states with votes:", exc)
        return states_data


async def districts(pool: Any, state_name: str | None = None, election_year: int | None = None) -> dict[str, Any]:
    selected_districts = _load_geojson(SPECIAL_DISTRICTS_FILE)
    features = selected_districts.get("features", [])
    if state_name:
        selected_state = state_name.strip().casefold()
        features = [
            feature for feature in features
            if str(feature.get("properties", {}).get("stname", "")).strip().casefold() == selected_state
        ]

    if pool is not None:
        try:
            rows = await pool.fetch("""
                WITH latest_elec AS (
                    SELECT e.election_id, e.election_year
                    FROM elections e
                    WHERE ($1::int IS NULL OR e.election_year = $1)
                    ORDER BY e.election_year DESC, e.election_id DESC
                    LIMIT 1
                )
                SELECT d.district_code,
                       COALESCE(SUM(br.electors), 0)::bigint AS electors,
                       COALESCE(SUM(br.votes_polled), 0)::bigint AS votes_polled,
                       COALESCE(SUM(br.votes_bjp), 0)::bigint AS votes_bjp,
                       COALESCE(SUM(br.votes_rld), 0)::bigint AS votes_rld,
                       COALESCE(SUM(br.votes_samajwadi), 0)::bigint AS votes_sp,
                       COALESCE(SUM(br.votes_bsp), 0)::bigint AS votes_bsp,
                       COALESCE(SUM(br.votes_inc), 0)::bigint AS votes_inc,
                       COALESCE(SUM(br.votes_aap), 0)::bigint AS votes_aap,
                       COALESCE(SUM(br.votes_aimim), 0)::bigint AS votes_aimim,
                       COALESCE(SUM(br.votes_asp), 0)::bigint AS votes_asp,
                       COALESCE(SUM(br.votes_ind), 0)::bigint AS votes_ind
                FROM districts d
                JOIN ac a ON a.district_code = d.district_code
                JOIN election_booths eb ON eb.ac_no = a.ac_no
                JOIN latest_elec le ON le.election_id = eb.election_id
                LEFT JOIN booth_results br ON br.booth_id = eb.booth_id
                GROUP BY d.district_code
            """, election_year)
            dist_stats = {}
            for row in rows:
                polled = row["votes_polled"] or 0
                party_votes = {
                    "BJP": row["votes_bjp"] or 0,
                    "RLD": row["votes_rld"] or 0,
                    "SP": row["votes_sp"] or 0,
                    "BSP": row["votes_bsp"] or 0,
                    "INC": row["votes_inc"] or 0,
                    "AAP": row["votes_aap"] or 0,
                    "AIMIM": row["votes_aimim"] or 0,
                    "ASP": row["votes_asp"] or 0,
                    "IND": row["votes_ind"] or 0,
                }
                party_shares = {
                    p: round(100.0 * cnt / polled, 2) if polled > 0 else 0.0
                    for p, cnt in party_votes.items()
                }
                sorted_parties = sorted(party_votes.items(), key=lambda item: -item[1])
                winner = sorted_parties[0][0] if sorted_parties and sorted_parties[0][1] > 0 else None
                dist_stats[str(row["district_code"])] = {
                    "electors": row["electors"] or 0,
                    "votes_polled": polled,
                    "party_votes": party_votes,
                    "party_shares": party_shares,
                    "winner": winner,
                }

            enriched_features = []
            for feature in features:
                props = dict(feature.get("properties") or {})
                code = str(props.get("dtcode11") or props.get("DT_CODE") or props.get("Dist_LGD") or "").strip()
                normalized_code = code.lstrip("0") or "0"
                stats = dist_stats.get(code) or dist_stats.get(normalized_code)
                if stats:
                    props.update(stats)
                else:
                    props["party_shares"] = {}
                    props["party_votes"] = {}
                    props["winner"] = None
                    props["votes_polled"] = 0
                    props["electors"] = 0
                enriched_features.append({**feature, "properties": props})
            features = enriched_features
        except Exception as exc:
            print("Error enriching districts with votes:", exc)

    return {
        **selected_districts,
        "features": features,
    }


async def assemblies(
    pool: Any,
    district_name: str | None = None,
    district_code: str | None = None,
    election_year: int | None = None,
) -> dict[str, Any]:
    """Return assembly boundaries from PostGIS, optionally filtered by district, with latest election party votes."""
    if pool is None:
        raise RuntimeError("DATABASE_URL is required for assembly data")
    rows = await pool.fetch(
        """WITH latest_elec AS (
               SELECT e.election_id, e.election_year
               FROM elections e
               WHERE ($3::int IS NULL OR e.election_year = $3)
               ORDER BY e.election_year DESC, e.election_id DESC
               LIMIT 1
           ), ac_votes AS (
               SELECT eb.ac_no,
                      COALESCE(SUM(br.electors), 0)::bigint AS electors,
                      COALESCE(SUM(br.votes_polled), 0)::bigint AS votes_polled,
                      COALESCE(SUM(br.votes_bjp), 0)::bigint AS votes_bjp,
                      COALESCE(SUM(br.votes_rld), 0)::bigint AS votes_rld,
                      COALESCE(SUM(br.votes_samajwadi), 0)::bigint AS votes_sp,
                      COALESCE(SUM(br.votes_bsp), 0)::bigint AS votes_bsp,
                      COALESCE(SUM(br.votes_inc), 0)::bigint AS votes_inc,
                      COALESCE(SUM(br.votes_aap), 0)::bigint AS votes_aap,
                      COALESCE(SUM(br.votes_aimim), 0)::bigint AS votes_aimim,
                      COALESCE(SUM(br.votes_asp), 0)::bigint AS votes_asp,
                      COALESCE(SUM(br.votes_ind), 0)::bigint AS votes_ind
               FROM election_booths eb
               JOIN latest_elec le ON le.election_id = eb.election_id
               LEFT JOIN booth_results br ON br.booth_id = eb.booth_id
               GROUP BY eb.ac_no
           )
           SELECT a.ac_no, COALESCE(a.geojson_name, a.name) AS name,
                  a.district_code, d.name AS district_name,
                  ST_AsGeoJSON(ST_Force2D(a.gis_boundary)) AS geometry,
                  v.electors, v.votes_polled,
                  v.votes_bjp, v.votes_rld, v.votes_sp, v.votes_bsp,
                  v.votes_inc, v.votes_aap, v.votes_aimim, v.votes_asp, v.votes_ind
           FROM ac a
           LEFT JOIN districts d USING (district_code)
           LEFT JOIN ac_votes v ON v.ac_no = a.ac_no
           WHERE ($1::text IS NULL OR lower(d.name) = lower($1))
             AND ($2::text IS NULL OR d.district_code::text = $2)
           ORDER BY a.ac_no""",
        district_name,
        district_code,
        election_year,
    )
    features = []
    for row in rows:
        polled = row["votes_polled"] or 0
        electors = row["electors"] or 0
        party_votes = {
            "BJP": row["votes_bjp"] or 0,
            "RLD": row["votes_rld"] or 0,
            "SP": row["votes_sp"] or 0,
            "BSP": row["votes_bsp"] or 0,
            "INC": row["votes_inc"] or 0,
            "AAP": row["votes_aap"] or 0,
            "AIMIM": row["votes_aimim"] or 0,
            "ASP": row["votes_asp"] or 0,
            "IND": row["votes_ind"] or 0,
        }
        party_shares = {
            p: round(100.0 * cnt / polled, 2) if polled > 0 else 0.0
            for p, cnt in party_votes.items()
        }
        # determine leading party
        sorted_parties = sorted(party_votes.items(), key=lambda item: -item[1])
        winner = sorted_parties[0][0] if sorted_parties and sorted_parties[0][1] > 0 else None

        features.append({
            "type": "Feature",
            "geometry": json.loads(row["geometry"]) if row["geometry"] else None,
            "properties": {
                "ac_no": row["ac_no"],
                "ac_name": row["name"],
                "name": row["name"],
                "district_code": row["district_code"],
                "district_name": row["district_name"],
                "electors": electors,
                "votes_polled": polled,
                "winner": winner,
                "party_votes": party_votes,
                "party_shares": party_shares,
            },
        })
    return {
        "type": "FeatureCollection",
        "features": features,
    }


async def villages(pool: Any, ac_no: str, election_year: int | None = None) -> dict[str, Any]:
    if pool is None:
        raise RuntimeError("DATABASE_URL is required for village data")
    rows = await pool.fetch(
        """WITH latest_elec AS (
               SELECT e.election_id
               FROM elections e
               JOIN election_booths eb ON eb.election_id = e.election_id
               WHERE eb.ac_no::text = $1
                 AND ($2::int IS NULL OR e.election_year = $2)
               ORDER BY e.election_year DESC, e.election_id DESC
               LIMIT 1
           ), vb_grouped AS (
               SELECT MIN(vb.objectid) AS objectid,
                      regexp_replace(lower(vb.name), '[^a-z0-9]', '', 'g') AS norm_name,
                      vb.ac_no,
                      MIN(vb.name) AS name,
                      MIN(vb.alternate_name) AS alternate_name,
                      MIN(vb.vil_lgd) AS vil_lgd,
                      array_agg(DISTINCT vb.district_code) AS district_codes,
                      array_agg(DISTINCT d.name ORDER BY d.name) AS district_names,
                      MAX(v.sentiment) AS sentiment,
                      ST_AsGeoJSON(ST_Force2D(ST_Multi(ST_CollectionExtract(ST_Collect(DISTINCT vb.gis_object), 3)))) AS geometry,
                      array_agg(DISTINCT vb.objectid ORDER BY vb.objectid) AS source_objectids
               FROM village_boundaries vb
               JOIN districts d USING (district_code)
               LEFT JOIN villages v ON v.village_id = vb.village_id
               WHERE vb.ac_no::text = $1
               GROUP BY vb.ac_no, regexp_replace(lower(vb.name), '[^a-z0-9]', '', 'g')
           ), v_distinct_links AS (
               SELECT DISTINCT
                      regexp_replace(lower(vb.name), '[^a-z0-9]', '', 'g') AS norm_name,
                      COALESCE(l.village_id, vb.village_id) AS village_id
               FROM village_boundaries vb
               LEFT JOIN village_boundary_village_links l ON l.boundary_objectid = vb.objectid
               WHERE vb.ac_no::text = $1 AND COALESCE(l.village_id, vb.village_id) IS NOT NULL
           ), v_votes AS (
               SELECT vl.norm_name,
                      array_agg(DISTINCT vl.village_id ORDER BY vl.village_id) AS village_ids,
                      COALESCE(SUM(br.electors), 0)::bigint AS electors,
                      COALESCE(SUM(br.votes_polled), 0)::bigint AS votes_polled,
                      COALESCE(SUM(br.votes_bjp), 0)::bigint AS votes_bjp,
                      COALESCE(SUM(br.votes_rld), 0)::bigint AS votes_rld,
                      COALESCE(SUM(br.votes_samajwadi), 0)::bigint AS votes_sp,
                      COALESCE(SUM(br.votes_bsp), 0)::bigint AS votes_bsp,
                      COALESCE(SUM(br.votes_inc), 0)::bigint AS votes_inc,
                      COALESCE(SUM(br.votes_aap), 0)::bigint AS votes_aap,
                      COALESCE(SUM(br.votes_aimim), 0)::bigint AS votes_aimim,
                      COALESCE(SUM(br.votes_asp), 0)::bigint AS votes_asp,
                      COALESCE(SUM(br.votes_ind), 0)::bigint AS votes_ind
               FROM v_distinct_links vl
               JOIN election_booths eb ON eb.village_id = vl.village_id AND eb.ac_no::text = $1
               JOIN latest_elec le ON le.election_id = eb.election_id
               LEFT JOIN booth_results br ON br.booth_id = eb.booth_id
               GROUP BY vl.norm_name
           )
           SELECT g.objectid,
                  COALESCE(vv.village_ids[1], NULL) AS village_id,
                  COALESCE(vv.village_ids, ARRAY[]::bigint[]) AS village_ids,
                  g.ac_no, g.name, g.alternate_name, g.vil_lgd, g.district_codes, g.district_names,
                  g.sentiment, g.geometry, g.source_objectids,
                  COALESCE(vv.electors, 0) AS electors,
                  COALESCE(vv.votes_polled, 0) AS votes_polled,
                  COALESCE(vv.votes_bjp, 0) AS votes_bjp,
                  COALESCE(vv.votes_rld, 0) AS votes_rld,
                  COALESCE(vv.votes_sp, 0) AS votes_sp,
                  COALESCE(vv.votes_bsp, 0) AS votes_bsp,
                  COALESCE(vv.votes_inc, 0) AS votes_inc,
                  COALESCE(vv.votes_aap, 0) AS votes_aap,
                  COALESCE(vv.votes_aimim, 0) AS votes_aimim,
                  COALESCE(vv.votes_asp, 0) AS votes_asp,
                  COALESCE(vv.votes_ind, 0) AS votes_ind
           FROM vb_grouped g
           LEFT JOIN v_votes vv ON vv.norm_name = g.norm_name
           ORDER BY g.name, g.objectid""",
        str(ac_no),
        election_year,
    )
    features = []
    for row in rows:
        polled = row["votes_polled"] or 0
        electors = row["electors"] or 0
        party_votes = {
            "BJP": row["votes_bjp"] or 0,
            "RLD": row["votes_rld"] or 0,
            "SP": row["votes_sp"] or 0,
            "BSP": row["votes_bsp"] or 0,
            "INC": row["votes_inc"] or 0,
            "AAP": row["votes_aap"] or 0,
            "AIMIM": row["votes_aimim"] or 0,
            "ASP": row["votes_asp"] or 0,
            "IND": row["votes_ind"] or 0,
        }
        party_shares = {
            p: round(100.0 * cnt / polled, 2) if polled > 0 else 0.0
            for p, cnt in party_votes.items()
        }
        sorted_parties = sorted(party_votes.items(), key=lambda item: -item[1])
        winner = sorted_parties[0][0] if sorted_parties and sorted_parties[0][1] > 0 else None

        features.append({
            "type": "Feature",
            "geometry": json.loads(row["geometry"]) if row["geometry"] else None,
            "properties": {
                "village_id": row["village_id"],
                "village_ids": row["village_ids"] or [],
                "objectid": row["objectid"],
                "ac_no": row["ac_no"],
                "village_name": row["name"],
                "name": row["name"],
                "alternate_name": row["alternate_name"],
                "vil_lgd": row["vil_lgd"],
                "district_codes": row["district_codes"],
                "district_names": row["district_names"],
                "source_objectids": row["source_objectids"],
                "sentiment": row["sentiment"],
                "electors": electors,
                "votes_polled": polled,
                "party_votes": party_votes,
                "party_shares": party_shares,
                "winner": winner,
            },
        })
    return {
        "type": "FeatureCollection",
        "features": features,
    }


async def call_reports(
    pool: Any,
    state: str | None = None,
    district_code: str | None = None,
    ac_no: str | None = None,
    village_ids: list[int] | None = None,
    level: str = "state",
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Return substantive call reports for any selected geography, newest first."""
    if pool is None:
        raise RuntimeError("DATABASE_URL is required for call reports")
    bounded_limit = min(max(int(limit), 1), 250)
    rows = await pool.fetch(
        """SELECT c.cid, c.provider, c.provider_call_id, c.created_at,
                  c.summary, c.category, c.feedback, c.flag,
                  COALESCE(c.ac_no, ss.ac_no) AS ac_no,
                  COALESCE(c.village_id, ss.village_id) AS village_id,
                  a.name AS ac_name, d.name AS district_name,
                  COALESCE(v.name, vb.name) AS village_name
           FROM public."call" c
           LEFT JOIN sampark_sutra ss ON ss.sid = c.sid
           JOIN ac a ON a.ac_no = COALESCE(c.ac_no, ss.ac_no)
           LEFT JOIN districts d ON d.district_code = a.district_code
           LEFT JOIN villages v ON v.village_id = COALESCE(c.village_id, ss.village_id)
           LEFT JOIN LATERAL (
               SELECT MIN(vb.name) AS name
               FROM village_boundaries vb
               WHERE vb.village_id = COALESCE(c.village_id, ss.village_id)
                 AND vb.ac_no = COALESCE(c.ac_no, ss.ac_no)
           ) vb ON TRUE
           WHERE ($1::text IS NULL OR lower(d.state_name) = lower($1))
             AND ($2::text IS NULL OR d.district_code::text = $2)
             AND ($3::text IS NULL OR COALESCE(c.ac_no, ss.ac_no)::text = $3)
             AND ($4::text <> 'village' OR (
                 COALESCE(array_length($5::bigint[], 1), 0) > 0
                 AND COALESCE(c.village_id, ss.village_id) = ANY($5::bigint[])
             ))
           ORDER BY c.created_at DESC, c.cid DESC
           LIMIT $6""",
        state, district_code, ac_no, level, village_ids or [], bounded_limit,
    )
    return [
        {"report_id": row["cid"], "provider": row["provider"],
         "call_id": row["provider_call_id"], "occurred_at": row["created_at"].isoformat(),
         "issue": row["summary"], "category": row["category"],
         "has_problem": str(row["flag"] or "").lower() in ("true", "1", "yes", "problem", "substantive"),
         "feedback": row["feedback"], "ac_no": row["ac_no"], "village_id": row["village_id"],
         "area": row["village_name"] or row["ac_name"],
         "district": row["district_name"]}
        for row in rows
    ]


async def assembly_dashboard(pool: Any, ac_no: str, election_year: int | None = None) -> dict[str, Any] | None:
    if pool is None:
        raise RuntimeError("DATABASE_URL is required for dashboard metrics")
    row = await pool.fetchrow(
        """WITH selected_ac AS (
               SELECT ac_no, name, geojson_name, district_code FROM ac WHERE ac_no::text = $1 LIMIT 1
           ), latest_election AS (
               SELECT e.election_id, e.election_year, e.election_name
               FROM elections e JOIN election_booths eb USING (election_id)
               WHERE eb.ac_no::text = $1
                 AND ($2::int IS NULL OR e.election_year = $2)
               ORDER BY e.election_year DESC, e.election_id DESC LIMIT 1
           ), metrics AS (
               SELECT COUNT(DISTINCT eb.booth_id)::bigint AS booth_records,
                      COALESCE(SUM(br.votes_polled), 0)::bigint AS total_votes,
                      COALESCE(SUM(br.votes_bjp), 0)::bigint AS bjp_votes,
                      COALESCE(SUM(br.votes_rld), 0)::bigint AS rld_votes
               FROM latest_election le
               JOIN election_booths eb ON eb.election_id = le.election_id AND eb.ac_no::text = $1
               LEFT JOIN booth_results br USING (booth_id)
           )
           SELECT sa.ac_no, COALESCE(sa.geojson_name,sa.name) AS ac_name, le.election_year, le.election_name,
                  d.name AS district_name,
                  m.booth_records, m.total_votes, m.bjp_votes, m.rld_votes
           FROM selected_ac sa LEFT JOIN latest_election le ON TRUE CROSS JOIN metrics m
           LEFT JOIN districts d ON d.district_code=sa.district_code""",
        str(ac_no),
        election_year,
    )
    if row is None:
        return None
    total = row["total_votes"] or 0
    bjp = row["bjp_votes"] or 0
    rld = row["rld_votes"] or 0
    unavailable_band = {"booths": None, "percent": None}
    return {
        "overview": {"ac_no": row["ac_no"], "ac_name": row["ac_name"], "district_name": row["district_name"],
                     "election_year": row["election_year"], "election_name": row["election_name"]},
        # The source schema has no booth-band classification, so keep these
        # slots null for the current dashboard.
        "party_band_summary": {party: {band: dict(unavailable_band) for band in ("Red", "Amber", "Yellow", "Green")}
                               for party in ("BJP", "RLD")},
        "data_checks": {"booth_records": row["booth_records"] or 0, "total_votes": total,
                        "bjp_votes": bjp, "bjp_vote_share": round(100 * bjp / total, 2) if total else None,
                        "rld_votes": rld, "rld_vote_share": round(100 * rld / total, 2) if total else None},
    }


async def poll_results(
    pool: Any,
    state_name: str | None = None,
    district_code: str | None = None,
    ac_no: str | None = None,
    village_id: int | None = None,
    level: str = "state",
    election_year: int | None = None,
    village_ids: list[int] | None = None,
) -> dict[str, Any]:
    """Aggregate the latest available election results for a hierarchy scope."""
    if pool is None:
        raise RuntimeError("DATABASE_URL is required for poll results")
    row = await pool.fetchrow(
        """WITH scoped_booths AS (
               SELECT eb.election_id, eb.booth_id
               FROM election_booths eb
               JOIN ac a USING (ac_no)
               JOIN districts d USING (district_code)
               WHERE ($1::text IS NULL OR lower(d.state_name) = lower($1))
                 AND ($2::text IS NULL OR d.district_code::text = $2)
                 AND ($3::text IS NULL OR eb.ac_no::text = $3)
                 AND ($4::text <> 'village' OR (
                     COALESCE(array_length($6::bigint[], 1), 0) > 0
                     AND eb.village_id = ANY($6::bigint[])
                 ))
           ), latest_election AS (
               SELECT e.election_id, e.election_year, e.election_type, e.election_name
               FROM elections e
               WHERE EXISTS (SELECT 1 FROM scoped_booths sb WHERE sb.election_id = e.election_id)
                 AND ($5::int IS NULL OR e.election_year = $5)
               ORDER BY e.election_year DESC, e.election_id DESC
               LIMIT 1
           )
           SELECT le.election_id, le.election_year, le.election_type, le.election_name,
                  COUNT(sb.booth_id)::bigint AS booth_records,
                  COUNT(br.booth_id)::bigint AS booths_with_results,
                  COALESCE(SUM(br.electors), 0)::bigint AS electors,
                  COALESCE(SUM(br.votes_polled), 0)::bigint AS votes_polled,
                  COALESCE(SUM(br.valid_votes), 0)::bigint AS valid_votes,
                  COALESCE(SUM(br.votes_bjp), 0)::bigint AS votes_bjp,
                  COALESCE(SUM(br.votes_rld), 0)::bigint AS votes_rld,
                  COALESCE(SUM(br.votes_bsp), 0)::bigint AS votes_bsp,
                  COALESCE(SUM(br.votes_inc), 0)::bigint AS votes_inc,
                  COALESCE(SUM(br.votes_aap), 0)::bigint AS votes_aap,
                  COALESCE(SUM(br.votes_aimim), 0)::bigint AS votes_aimim,
                  COALESCE(SUM(br.votes_ind), 0)::bigint AS votes_ind,
                  COALESCE(SUM(br.votes_asp), 0)::bigint AS votes_asp,
                  COALESCE(SUM(br.votes_nota), 0)::bigint AS votes_nota,
                  COALESCE(SUM(br.votes_samajwadi), 0)::bigint AS votes_samajwadi,
                  COALESCE(SUM(br.votes_other_nota), 0)::bigint AS votes_other_nota
           FROM latest_election le
           LEFT JOIN scoped_booths sb ON sb.election_id = le.election_id
           LEFT JOIN booth_results br USING (booth_id)
           GROUP BY le.election_id, le.election_year, le.election_type, le.election_name""",
        state_name,
        district_code,
        ac_no,
        level,
        election_year,
        village_ids or ([village_id] if village_id is not None else None),
    )
    if row is None:
        return {
            "election": None,
            "booth_records": 0,
            "booths_with_results": 0,
            "electors": 0,
            "votes_polled": 0,
            "valid_votes": 0,
            "party_votes": [],
            "booths": [],
        }

    total_votes = row["votes_polled"] or 0
    candidate_parties = [
        ("BJP", row["votes_bjp"] or 0),
        ("SP", row["votes_samajwadi"] or 0),
        ("RLD", row["votes_rld"] or 0),
        ("BSP", row["votes_bsp"] or 0),
        ("INC", row["votes_inc"] or 0),
        ("AAP", row["votes_aap"] or 0),
        ("AIMIM", row["votes_aimim"] or 0),
        ("ASP", row["votes_asp"] or 0),
        ("Independent / Others", row["votes_ind"] or 0),
        ("NOTA", row["votes_nota"] or row["votes_other_nota"] or 0),
    ]
    parties = [p for p in candidate_parties if p[1] > 0]
    parties.sort(key=lambda p: -p[1])
    if not parties and total_votes == 0:
        parties = [("BJP", 0), ("RLD", 0)]

    booths_list: list[dict[str, Any]] = []
    effective_village_ids = village_ids or ([village_id] if village_id is not None else None)
    if level == "village" and effective_village_ids and row["election_id"]:
        booth_rows = await pool.fetch(
            """SELECT eb.booth_id,
                      eb.booth_no,
                      COALESCE(NULLIF(trim(ps.name), ''), 'Booth ' || eb.booth_no) AS booth_name,
                      eb.village_id,
                      COALESCE(v.name, 'Unassigned') AS village_name,
                      COALESCE(br.electors, 0) AS electors,
                      COALESCE(br.votes_polled, 0) AS votes_polled,
                      COALESCE(br.valid_votes, 0) AS valid_votes,
                      COALESCE(br.votes_bjp, 0) AS votes_bjp,
                      COALESCE(br.votes_samajwadi, 0) AS votes_samajwadi,
                      COALESCE(br.votes_rld, 0) AS votes_rld,
                      COALESCE(br.votes_bsp, 0) AS votes_bsp,
                      COALESCE(br.votes_inc, 0) AS votes_inc,
                      COALESCE(br.votes_aap, 0) AS votes_aap,
                      COALESCE(br.votes_aimim, 0) AS votes_aimim,
                      COALESCE(br.votes_asp, 0) AS votes_asp,
                      COALESCE(br.votes_ind, 0) AS votes_ind,
                      COALESCE(br.votes_nota, br.votes_other_nota, 0) AS votes_nota
               FROM election_booths eb
               LEFT JOIN polling_stations ps ON ps.ps_id = eb.ps_id
               LEFT JOIN villages v ON v.village_id = eb.village_id
               LEFT JOIN booth_results br ON br.booth_id = eb.booth_id
               WHERE eb.election_id = $1
                 AND eb.village_id = ANY($2::bigint[])
               ORDER BY NULLIF(regexp_replace(eb.booth_no, '[^0-9]', '', 'g'), '')::int NULLS LAST,
                        eb.booth_no,
                        eb.booth_id""",
            row["election_id"],
            effective_village_ids,
        )
    elif level == "ac" and ac_no and row["election_id"]:
        booth_rows = await pool.fetch(
            """SELECT eb.booth_id,
                      eb.booth_no,
                      COALESCE(NULLIF(trim(ps.name), ''), 'Booth ' || eb.booth_no) AS booth_name,
                      eb.village_id,
                      COALESCE(v.name, 'Unassigned') AS village_name,
                      COALESCE(br.electors, 0) AS electors,
                      COALESCE(br.votes_polled, 0) AS votes_polled,
                      COALESCE(br.valid_votes, 0) AS valid_votes,
                      COALESCE(br.votes_bjp, 0) AS votes_bjp,
                      COALESCE(br.votes_samajwadi, 0) AS votes_samajwadi,
                      COALESCE(br.votes_rld, 0) AS votes_rld,
                      COALESCE(br.votes_bsp, 0) AS votes_bsp,
                      COALESCE(br.votes_inc, 0) AS votes_inc,
                      COALESCE(br.votes_aap, 0) AS votes_aap,
                      COALESCE(br.votes_aimim, 0) AS votes_aimim,
                      COALESCE(br.votes_asp, 0) AS votes_asp,
                      COALESCE(br.votes_ind, 0) AS votes_ind,
                      COALESCE(br.votes_nota, br.votes_other_nota, 0) AS votes_nota
               FROM election_booths eb
               LEFT JOIN polling_stations ps ON ps.ps_id = eb.ps_id
               LEFT JOIN villages v ON v.village_id = eb.village_id
               LEFT JOIN booth_results br ON br.booth_id = eb.booth_id
               WHERE eb.election_id = $1
                 AND eb.ac_no::text = $2
               ORDER BY NULLIF(regexp_replace(eb.booth_no, '[^0-9]', '', 'g'), '')::int NULLS LAST,
                        eb.booth_no,
                        eb.booth_id""",
            row["election_id"],
            str(ac_no),
        )
    else:
        booth_rows = []

    for b_row in booth_rows:
        b_electors = b_row["electors"] or 0
        b_polled = b_row["votes_polled"] or 0
        b_valid = b_row["valid_votes"] or 0
        b_total = b_valid or b_polled or 0
        b_candidates = [
            ("BJP", b_row["votes_bjp"] or 0),
            ("SP", b_row["votes_samajwadi"] or 0),
            ("RLD", b_row["votes_rld"] or 0),
            ("BSP", b_row["votes_bsp"] or 0),
            ("INC", b_row["votes_inc"] or 0),
            ("AAP", b_row["votes_aap"] or 0),
            ("AIMIM", b_row["votes_aimim"] or 0),
            ("ASP", b_row["votes_asp"] or 0),
            ("Independent / Others", b_row["votes_ind"] or 0),
            ("NOTA", b_row["votes_nota"] or 0),
        ]
        b_active = []
        for p_name, p_votes in b_candidates:
            if p_votes > 0:
                share = round(100 * p_votes / b_total, 2) if b_total else None
                b_active.append({
                    "party": p_name,
                    "votes": p_votes,
                    "share_percent": share,
                })
        b_active.sort(key=lambda p: -p["votes"])

        turnout = round(100 * b_polled / b_electors, 1) if b_electors and b_polled else None

        booths_list.append({
            "booth_id": b_row["booth_id"],
            "booth_no": str(b_row["booth_no"]),
            "booth_name": b_row["booth_name"],
            "village_id": b_row["village_id"],
            "village_name": b_row["village_name"],
            "electors": b_electors,
            "votes_polled": b_polled,
            "valid_votes": b_valid,
            "turnout_percent": turnout,
            "leading_party": b_active[0] if b_active else None,
            "party_votes": b_active,
        })

    return {
        "election": {
            "election_id": row["election_id"],
            "year": row["election_year"],
            "type": row["election_type"],
            "name": row["election_name"],
        },
        "booth_records": row["booth_records"] or 0,
        "booths_with_results": row["booths_with_results"] or 0,
        "electors": row["electors"] or 0,
        "votes_polled": total_votes,
        "valid_votes": row["valid_votes"] or 0,
        "party_votes": [
            {
                "party": name,
                "votes": votes or 0,
                "share_percent": round(100 * (votes or 0) / total_votes, 2) if total_votes else None,
            }
            for name, votes in parties
        ],
        "booths": booths_list,
    }


async def election_years(
    pool: Any,
    state_name: str | None = None,
    district_code: str | None = None,
    ac_no: str | None = None,
    village_id: int | None = None,
    level: str = "state",
    village_ids: list[int] | None = None,
) -> list[int]:
    """Return election years with booths in the requested hierarchy scope."""
    if pool is None:
        raise RuntimeError("DATABASE_URL is required for election years")
    rows = await pool.fetch(
        """SELECT DISTINCT e.election_year
           FROM elections e
           JOIN election_booths eb USING (election_id)
           JOIN ac a USING (ac_no)
           JOIN districts d USING (district_code)
           WHERE ($1::text IS NULL OR lower(d.state_name) = lower($1))
             AND ($2::text IS NULL OR d.district_code::text = $2)
             AND ($3::text IS NULL OR eb.ac_no::text = $3)
             AND ($4::text <> 'village' OR (
                 COALESCE(array_length($5::bigint[], 1), 0) > 0
                 AND eb.village_id = ANY($5::bigint[])
             ))
           ORDER BY e.election_year DESC""",
        state_name, district_code, ac_no, level,
        village_ids or ([village_id] if village_id is not None else None),
    )
    return [row["election_year"] for row in rows]


SELECTED_16_DISTRICT_CODES = (
    132, 133, 134, 135, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 704, 705
)

async def constituencies(pool: Any, district_code: str | None = None) -> list[dict[str, Any]]:
    """Return list of constituencies for the 16 selected UP districts, optionally filtered by district."""
    if pool is None:
        return []
    
    codes_tuple = tuple(int(c) for c in SELECTED_16_DISTRICT_CODES)
    if district_code:
        try:
            d_int = int(district_code)
            if d_int in codes_tuple:
                codes_tuple = (d_int,)
        except (ValueError, TypeError):
            pass

    codes_sql = ",".join(str(c) for c in codes_tuple)
    rows = await pool.fetch(
        f"""SELECT a.ac_no,
                  COALESCE(a.geojson_name, a.name) AS name,
                  a.district_code,
                  COALESCE(d.name, 'District ' || a.district_code) AS district_name,
                  COUNT(eb.booth_id)::int AS booth_count
           FROM ac a
           JOIN districts d ON d.district_code = a.district_code
           LEFT JOIN election_booths eb ON eb.ac_no = a.ac_no
           WHERE a.district_code IN ({codes_sql})
           GROUP BY a.ac_no, a.geojson_name, a.name, a.district_code, d.name
           ORDER BY d.name ASC, (COUNT(eb.booth_id) > 0) DESC, a.ac_no ASC"""
    )
    return [
        {
            "ac_no": str(row["ac_no"]),
            "name": row["name"],
            "district_code": str(row["district_code"]) if row["district_code"] is not None else None,
            "district_name": row["district_name"],
            "booth_count": row["booth_count"],
        }
        for row in rows
    ]



async def calling_stats(
    pool: Any,
    ac_no: str | None = None,
    village_id: int | None = None,
) -> dict[str, Any]:
    """Return comprehensive calling telephony metrics, category breakdown, daily trends, and recent calls."""
    if pool is None:
        raise RuntimeError("DATABASE_URL is required for calling stats")

    # Overall KPIs
    overall = await pool.fetchrow(
        """SELECT 
               COUNT(*)::int AS total_calls,
               COUNT(CASE WHEN flag IN ('true', '1', 'yes', 'problem', 'substantive') THEN 1 END)::int AS issues_reported,
               COUNT(CASE WHEN flag NOT IN ('true', '1', 'yes', 'problem', 'substantive') OR flag IS NULL THEN 1 END)::int AS clear_calls,
               COUNT(DISTINCT ac_no)::int AS acs_covered,
               COUNT(DISTINCT village_id)::int AS villages_covered,
               COUNT(DISTINCT sid)::int AS unique_contacts_called
           FROM public.\"call\""""
    )

    # Filtered KPIs if ac_no or village_id specified
    filtered = None
    if ac_no is not None or village_id is not None:
        filtered_row = await pool.fetchrow(
            """SELECT 
                   COUNT(*)::int AS total_calls,
                   COUNT(CASE WHEN flag IN ('true', '1', 'yes', 'problem', 'substantive') THEN 1 END)::int AS issues_reported,
                   COUNT(CASE WHEN flag NOT IN ('true', '1', 'yes', 'problem', 'substantive') OR flag IS NULL THEN 1 END)::int AS clear_calls,
                   COUNT(DISTINCT village_id)::int AS villages_covered,
                   COUNT(DISTINCT sid)::int AS unique_contacts_called
               FROM public.\"call\"
               WHERE ($1::text IS NULL OR ac_no::text = $1)
                 AND ($2::bigint IS NULL OR village_id = $2)""",
            ac_no, village_id,
        )
        if filtered_row:
            tot = filtered_row["total_calls"]
            iss = filtered_row["issues_reported"]
            filtered = {
                "total_calls": tot,
                "issues_reported": iss,
                "clear_calls": filtered_row["clear_calls"],
                "issue_rate_percent": round(100.0 * iss / tot, 1) if tot > 0 else 0.0,
                "villages_covered": filtered_row["villages_covered"],
                "unique_contacts_called": filtered_row["unique_contacts_called"],
            }

    # Category distribution
    categories = await pool.fetch(
        """SELECT COALESCE(NULLIF(trim(category), ''), 'General / Uncategorized') AS category,
                  COUNT(*)::int AS count
           FROM public.\"call\"
           GROUP BY 1
           ORDER BY count DESC"""
    )
    total_calls_all = overall["total_calls"] if overall else 0
    cat_list = [
        {
            "category": row["category"],
            "count": row["count"],
            "percentage": round(100.0 * row["count"] / total_calls_all, 1) if total_calls_all else 0.0,
        }
        for row in categories
    ]

    # Daily trends (last 30 days of activity)
    daily = await pool.fetch(
        """SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS call_date,
                  COUNT(*)::int AS total,
                  COUNT(CASE WHEN flag IN ('true', '1', 'yes', 'problem', 'substantive') THEN 1 END)::int AS issues,
                  COUNT(CASE WHEN flag NOT IN ('true', '1', 'yes', 'problem', 'substantive') OR flag IS NULL THEN 1 END)::int AS clear
           FROM public.\"call\"
           GROUP BY 1
           ORDER BY call_date ASC"""
    )
    daily_list = [
        {
            "call_date": row["call_date"],
            "total": row["total"],
            "issues": row["issues"],
            "clear": row["clear"],
        }
        for row in daily
    ]

    # AC-wise breakdown
    ac_rows = await pool.fetch(
        """SELECT c.ac_no,
                  COALESCE(a.name, 'AC ' || c.ac_no) AS ac_name,
                  COUNT(*)::int AS total,
                  COUNT(CASE WHEN c.flag IN ('true', '1', 'yes', 'problem', 'substantive') THEN 1 END)::int AS issues
           FROM public.\"call\" c
           LEFT JOIN ac a ON a.ac_no = c.ac_no
           WHERE c.ac_no IS NOT NULL
           GROUP BY c.ac_no, a.name
           ORDER BY total DESC"""
    )
    ac_list = [
        {
            "ac_no": str(row["ac_no"]),
            "ac_name": row["ac_name"],
            "total": row["total"],
            "issues": row["issues"],
            "clear": row["total"] - row["issues"],
        }
        for row in ac_rows
    ]

    # Recent calls feed
    recent_rows = await pool.fetch(
        """SELECT c.cid, c.created_at, c.summary, c.category, c.feedback, c.flag,
                  COALESCE(c.ac_no, ss.ac_no) AS ac_no,
                  COALESCE(c.village_id, ss.village_id) AS village_id,
                  a.name AS ac_name,
                  COALESCE(v.name, 'Village ' || COALESCE(c.village_id, ss.village_id)) AS village_name,
                  ss.name AS contact_name,
                  ss.phone AS contact_phone
           FROM public.\"call\" c
           LEFT JOIN sampark_sutra ss ON ss.sid = c.sid
           LEFT JOIN ac a ON a.ac_no = COALESCE(c.ac_no, ss.ac_no)
           LEFT JOIN villages v ON v.village_id = COALESCE(c.village_id, ss.village_id)
           WHERE ($1::text IS NULL OR COALESCE(c.ac_no, ss.ac_no)::text = $1)
             AND ($2::bigint IS NULL OR COALESCE(c.village_id, ss.village_id) = $2)
           ORDER BY c.created_at DESC, c.cid DESC
           LIMIT 30""",
        ac_no, village_id,
    )
    recent_list = [
        {
            "report_id": row["cid"],
            "occurred_at": row["created_at"].isoformat() if row["created_at"] else None,
            "summary": row["summary"],
            "category": row["category"],
            "feedback": row["feedback"],
            "has_problem": str(row["flag"] or "").lower() in ("true", "1", "yes", "problem", "substantive"),
            "ac_no": str(row["ac_no"]) if row["ac_no"] is not None else None,
            "ac_name": row["ac_name"],
            "village_id": row["village_id"],
            "village_name": row["village_name"],
            "contact_name": row["contact_name"],
            "contact_phone": row["contact_phone"],
        }
        for row in recent_rows
    ]

    total_c = overall["total_calls"] if overall else 0
    issues_c = overall["issues_reported"] if overall else 0
    return {
        "overall": {
            "total_calls": total_c,
            "issues_reported": issues_c,
            "clear_calls": overall["clear_calls"] if overall else 0,
            "issue_rate_percent": round(100.0 * issues_c / total_c, 1) if total_c > 0 else 0.0,
            "acs_covered": overall["acs_covered"] if overall else 0,
            "villages_covered": overall["villages_covered"] if overall else 0,
            "unique_contacts_called": overall["unique_contacts_called"] if overall else 0,
        },
        "filtered": filtered,
        "categories": cat_list,
        "daily_trends": daily_list,
        "ac_breakdown": ac_list,
        "recent_calls": recent_list,
    }
