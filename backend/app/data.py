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
    PROJECT_ROOT / "UTTAR PRADESH" / "UP_SELECTED_16_DISTRICTS.geojson",
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


def states() -> dict[str, Any]:
    return _load_geojson(STATES_FILE)


async def districts(pool: Any, state_name: str | None = None) -> dict[str, Any]:
    # The map focuses on these 16 districts. Serve their checked-in boundaries
    # directly so district navigation does not depend on a database connection.
    selected_districts = _load_geojson(SPECIAL_DISTRICTS_FILE)
    if not state_name:
        return selected_districts

    selected_state = state_name.strip().casefold()
    return {
        **selected_districts,
        "features": [
            feature for feature in selected_districts["features"]
            if str(feature.get("properties", {}).get("stname", "")).strip().casefold()
            == selected_state
        ],
    }


async def assemblies(
    pool: Any,
    district_name: str | None = None,
    district_code: str | None = None,
) -> dict[str, Any]:
    """Return assembly boundaries from PostGIS, optionally filtered by district."""
    if pool is None:
        raise RuntimeError("DATABASE_URL is required for assembly data")
    rows = await pool.fetch(
        """SELECT a.ac_no, COALESCE(a.geojson_name, a.name) AS name,
                  a.district_code, d.name AS district_name,
                  ST_AsGeoJSON(ST_Force2D(a.gis_boundary)) AS geometry
           FROM ac a LEFT JOIN districts d USING (district_code)
           WHERE ($1::text IS NULL OR lower(d.name) = lower($1))
             AND ($2::text IS NULL OR d.district_code::text = $2)
           ORDER BY a.ac_no""",
        district_name,
        district_code,
    )
    return {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "geometry": json.loads(row["geometry"]) if row["geometry"] else None,
             "properties": {"ac_no": row["ac_no"], "ac_name": row["name"], "name": row["name"],
                            "district_code": row["district_code"], "district_name": row["district_name"]}}
            for row in rows
        ],
    }


async def villages(pool: Any, ac_no: str) -> dict[str, Any]:
    if pool is None:
        raise RuntimeError("DATABASE_URL is required for village data")
    rows = await pool.fetch(
        """SELECT MIN(vb.objectid) AS objectid, MIN(vb.village_id) AS village_id,
                  vb.ac_no, MIN(vb.name) AS name, MIN(vb.alternate_name) AS alternate_name,
                  MIN(vb.vil_lgd) AS vil_lgd, array_agg(DISTINCT vb.district_code) AS district_codes,
                  array_agg(DISTINCT d.name ORDER BY d.name) AS district_names,
                  MAX(v.sentiment) AS sentiment,
                  ST_AsGeoJSON(ST_Force2D(ST_Multi(ST_CollectionExtract(ST_Collect(vb.gis_object),3)))) AS geometry,
                  array_agg(DISTINCT vb.objectid ORDER BY vb.objectid) AS source_objectids
           FROM village_boundaries vb
           JOIN districts d USING (district_code)
           LEFT JOIN villages v USING (village_id)
           WHERE vb.ac_no::text = $1
           GROUP BY vb.ac_no, regexp_replace(lower(vb.name), '[^a-z0-9]', '', 'g')
           ORDER BY MIN(vb.name), MIN(vb.objectid)""",
        str(ac_no),
    )
    return {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "geometry": json.loads(row["geometry"]) if row["geometry"] else None, "properties": {
                "village_id": row["village_id"], "objectid": row["objectid"], "ac_no": row["ac_no"],
                "village_name": row["name"], "name": row["name"], "alternate_name": row["alternate_name"],
                "vil_lgd": row["vil_lgd"], "district_codes": row["district_codes"],
                "district_names": row["district_names"], "source_objectids": row["source_objectids"],
                "sentiment": row["sentiment"],
            }}
            for row in rows
        ],
    }


async def assembly_dashboard(pool: Any, ac_no: str) -> dict[str, Any] | None:
    if pool is None:
        raise RuntimeError("DATABASE_URL is required for dashboard metrics")
    row = await pool.fetchrow(
        """WITH selected_ac AS (
               SELECT ac_no, name, geojson_name, district_code FROM ac WHERE ac_no::text = $1 LIMIT 1
           ), latest_election AS (
               SELECT e.election_id, e.election_year, e.election_name
               FROM elections e JOIN election_booths eb USING (election_id)
               WHERE eb.ac_no::text = $1
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
                 AND ($5::text <> 'village' OR ($4::bigint IS NOT NULL AND eb.village_id = $4))
           ), latest_election AS (
               SELECT e.election_id, e.election_year, e.election_type, e.election_name
               FROM elections e
               WHERE EXISTS (SELECT 1 FROM scoped_booths sb WHERE sb.election_id = e.election_id)
                 AND ($6::int IS NULL OR e.election_year = $6)
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
                  COALESCE(SUM(br.votes_samajwadi), 0)::bigint AS votes_samajwadi,
                  COALESCE(SUM(br.votes_other_nota), 0)::bigint AS votes_other_nota
           FROM latest_election le
           LEFT JOIN scoped_booths sb ON sb.election_id = le.election_id
           LEFT JOIN booth_results br USING (booth_id)
           GROUP BY le.election_id, le.election_year, le.election_type, le.election_name""",
        state_name,
        district_code,
        ac_no,
        village_id,
        level,
        election_year,
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
        }

    total_votes = row["votes_polled"] or 0
    parties = [
        ("BJP", row["votes_bjp"]),
        ("RLD", row["votes_rld"]),
        ("Samajwadi", row["votes_samajwadi"]),
        ("Other / NOTA", row["votes_other_nota"]),
    ]
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
    }


async def election_years(
    pool: Any,
    state_name: str | None = None,
    district_code: str | None = None,
    ac_no: str | None = None,
    village_id: int | None = None,
    level: str = "state",
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
             AND ($5::text <> 'village' OR ($4::bigint IS NOT NULL AND eb.village_id = $4))
           ORDER BY e.election_year DESC""",
        state_name, district_code, ac_no, village_id, level,
    )
    return [row["election_year"] for row in rows]
