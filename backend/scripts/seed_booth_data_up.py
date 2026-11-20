#!/usr/bin/env python3
"""Seed booth-level data from 'offline_assets/Booth DATA UP-20261120T144427Z-1-001/Booth DATA UP'

Reads all 63 standardized booth CSVs:
  1. Resolves and creates missing villages in public.villages (and populates village_code).
  2. Ensures all booths exist in public.election_booths (including auxiliary booths like 226(A), 6(A)).
  3. Updates booth village_id links in public.election_booths.
  4. Upserts all party votes and vote shares in public.booth_results.

Usage:
  # Dry-run validation (no DB changes):
  python backend/scripts/seed_booth_data_up.py --dry-run

  # Apply all changes to database:
  python backend/scripts/seed_booth_data_up.py --apply
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import logging
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(PROJECT_ROOT / "backend" / ".env")
load_dotenv(PROJECT_ROOT / ".env")

import asyncpg

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seed_booth_data_up")

BASE_DATA_DIR = PROJECT_ROOT / "offline_assets" / "Booth DATA UP-20261120T144427Z-1-001" / "Booth DATA UP"

# Candidate mapping for AC 20 Dhampur 2022 (where candidate names are used instead of parties)
AC20_CANDIDATE_MAP = {
    "VOTES_ASHOK_KUMAR_RANA": "bjp",
    "VOTES_NAIM_UL_HASAN": "samajwadi",
    "VOTES_THAKUR_MOOLCHAND_CHAUHAN": "bsp",
    "VOTES_HUSSAIN_AHMAD": "aimim",
    "VOTES_ARUN_KUMAR_GAHLOT": "aap",
    "VOTES_MEETAN": "ind",
    "VOTES_VIVEK_KUMAR": "ind",
}


def to_int(val: Any) -> int:
    try:
        return int(float(str(val or 0).strip()))
    except (ValueError, TypeError):
        return 0


def to_float(val: Any) -> float:
    try:
        return float(str(val or 0).strip())
    except (ValueError, TypeError):
        return 0.0


def norm(text: Any) -> str:
    """Normalize text by stripping non-alphanumeric chars and lowercase."""
    return re.sub(r"[^a-z0-9]", "", str(text or "").lower())


@dataclass
class ParsedBooth:
    election_year: int
    election_id: int
    ac_no: int
    ac_name: str
    booth_no: str
    booth_name: str
    village_code: str
    village_name: str
    electors: int
    votes_polled: int
    valid_votes: int
    votes_bjp: int
    share_bjp: float
    votes_rld: int
    share_rld: float
    votes_samajwadi: int
    share_samajwadi: float
    votes_bsp: int
    share_bsp: float
    votes_inc: int
    share_inc: float
    votes_aap: int
    share_aap: float
    votes_aimim: int
    share_aimim: float
    votes_asp: int
    share_asp: float
    votes_ind: int
    share_ind: float
    votes_nota: int
    share_nota: float
    votes_other_nota: int
    source_file: str
    source_line: int


def extract_votes_for_row(row: dict[str, str], ac_no: int) -> dict[str, int]:
    """Parse party votes across diverse column naming conventions in CSV."""
    bjp = rld = sp = bsp = inc = aap = aimim = asp = ind = nota = 0

    # Special handling for AC 20 (candidate names)
    if ac_no == 20:
        for k, v in row.items():
            if not k or not v:
                continue
            ku = k.strip().upper()
            val = to_int(v)
            if ku in AC20_CANDIDATE_MAP:
                party = AC20_CANDIDATE_MAP[ku]
                if party == "bjp":
                    bjp += val
                elif party == "samajwadi":
                    sp += val
                elif party == "bsp":
                    bsp += val
                elif party == "aimim":
                    aimim += val
                elif party == "aap":
                    aap += val
                else:
                    ind += val
            elif "NOTA" in ku:
                nota += val
        return {
            "bjp": bjp, "rld": rld, "samajwadi": sp, "bsp": bsp, "inc": inc,
            "aap": aap, "aimim": aimim, "asp": asp, "ind": ind, "nota": nota,
        }

    for k, v in row.items():
        if not k or not v:
            continue
        ku = k.strip().upper()
        if not ku.startswith("VOTES_"):
            continue

        if ku in ("VOTES_POLLED", "VOTES_ITEMISED", "VOTES_OTHER_NOTA", "VOTES_TOTAL"):
            continue

        val = to_int(v)
        if val <= 0:
            continue

        if any(x in ku for x in ["BJP", "B_J_P"]):
            bjp += val
        elif any(x in ku for x in ["RLD"]):
            rld += val
        elif any(x in ku for x in ["_SP", "SAMAJWADI", "S_P"]) and "ASP" not in ku and "BSP" not in ku:
            sp += val
        elif any(x in ku for x in ["BSP", "B_S_P"]) and "SBSP" not in ku and "BTSP" not in ku:
            bsp += val
        elif any(x in ku for x in ["INC", "I_N_C", "CONGRESS"]):
            inc += val
        elif any(x in ku for x in ["AAP", "A_A_P"]):
            aap += val
        elif any(x in ku for x in ["AIMIM", "A_I_M_I_M", "AIMM"]):
            aimim += val
        elif any(x in ku for x in ["ASP", "AZAD_SAMAJ"]):
            asp += val
        elif any(x in ku for x in ["NOTA"]):
            nota += val
        else:
            # Independent or minor registered party
            ind += val

    return {
        "bjp": bjp, "rld": rld, "samajwadi": sp, "bsp": bsp, "inc": inc,
        "aap": aap, "aimim": aimim, "asp": asp, "ind": ind, "nota": nota,
    }


def parse_csv_file(filepath: Path) -> list[ParsedBooth]:
    """Parse a single booth CSV file into standardized ParsedBooth records."""
    fname = filepath.stem
    m_year = re.search(r"_(2017|2022|17|22)$", fname, re.IGNORECASE)
    year = 2017 if m_year and m_year.group(1) in ("2017", "17") else 2022
    election_id = 13 if year == 2017 else 9

    records = []
    with open(filepath, "r", encoding="utf-8-sig", errors="replace") as fp:
        reader = csv.DictReader(fp)
        for line_idx, r in enumerate(reader, start=2):
            ac_no = to_int(r.get("ac_no"))
            bno = str(r.get("booth_no") or "").strip()
            if not ac_no or not bno:
                continue

            ac_name = str(r.get("ac_name") or "").strip()
            bname = str(r.get("booth_name") or "").strip()
            vcode = str(r.get("village_code") or "").strip()
            vname = str(r.get("village") or "").strip()

            elec = to_int(r.get("electors"))
            polled = to_int(r.get("votes_polled"))
            valid = to_int(r.get("valid_votes"))

            votes = extract_votes_for_row(r, ac_no)
            denom = valid if valid > 0 else (polled if polled > 0 else 1)

            other_nota = to_int(r.get("votes_other_nota")) or votes["nota"]

            records.append(
                ParsedBooth(
                    election_year=year,
                    election_id=election_id,
                    ac_no=ac_no,
                    ac_name=ac_name,
                    booth_no=bno,
                    booth_name=bname,
                    village_code=vcode,
                    village_name=vname,
                    electors=elec,
                    votes_polled=polled,
                    valid_votes=valid,
                    votes_bjp=votes["bjp"],
                    share_bjp=round(votes["bjp"] / denom, 4),
                    votes_rld=votes["rld"],
                    share_rld=round(votes["rld"] / denom, 4),
                    votes_samajwadi=votes["samajwadi"],
                    share_samajwadi=round(votes["samajwadi"] / denom, 4),
                    votes_bsp=votes["bsp"],
                    share_bsp=round(votes["bsp"] / denom, 4),
                    votes_inc=votes["inc"],
                    share_inc=round(votes["inc"] / denom, 4),
                    votes_aap=votes["aap"],
                    share_aap=round(votes["aap"] / denom, 4),
                    votes_aimim=votes["aimim"],
                    share_aimim=round(votes["aimim"] / denom, 4),
                    votes_asp=votes["asp"],
                    share_asp=round(votes["asp"] / denom, 4),
                    votes_ind=votes["ind"],
                    share_ind=round(votes["ind"] / denom, 4),
                    votes_nota=votes["nota"],
                    share_nota=round(votes["nota"] / denom, 4),
                    votes_other_nota=other_nota,
                    source_file=filepath.name,
                    source_line=line_idx,
                )
            )

    return records


async def seed_booth_data(dry_run: bool = False) -> None:
    """Main seeding pipeline."""
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        logger.error("DATABASE_URL is not set!")
        sys.exit(1)

    csv_files = sorted(BASE_DATA_DIR.rglob("*.csv"))
    logger.info("Found %d CSV files under %s", len(csv_files), BASE_DATA_DIR)
    if not csv_files:
        logger.error("No CSV files found!")
        sys.exit(1)

    # 1. Parse all records
    all_booths: list[ParsedBooth] = []
    for f in csv_files:
        booths = parse_csv_file(f)
        all_booths.extend(booths)

    logger.info("Total parsed booth records from CSVs: %d", len(all_booths))

    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    try:
        # Pre-seed verification
        total_booths_before = await conn.fetchval("SELECT COUNT(*) FROM election_booths")
        total_results_before = await conn.fetchval("SELECT COUNT(*) FROM booth_results")
        total_villages_before = await conn.fetchval("SELECT COUNT(*) FROM villages")
        logger.info(
            "Current DB state: %d booths, %d booth results, %d villages",
            total_booths_before, total_results_before, total_villages_before
        )

        # 2. Cache villages: by village_code and (ac_no, norm(name))
        v_rows = await conn.fetch("SELECT village_id, ac_no, village_code, name FROM villages")
        village_by_code: dict[str, int] = {r["village_code"]: r["village_id"] for r in v_rows if r["village_code"]}
        village_by_ac_norm: dict[tuple[int, str], int] = {
            (r["ac_no"], norm(r["name"])): r["village_id"] for r in v_rows if r["name"]
        }
        village_code_by_id: dict[int, str] = {r["village_id"]: r["village_code"] for r in v_rows if r["village_code"]}

        # 3. Resolve / Insert Villages
        villages_to_insert = []
        village_codes_to_update = []
        resolved_village_map: dict[tuple[int, str, str], int] = {}  # (ac_no, vcode, vname) -> village_id

        stats = {
            "villages_created": 0,
            "village_codes_updated": 0,
            "booths_created": 0,
            "booths_updated": 0,
            "results_upserted": 0,
        }

        # Gather unique (ac_no, vcode, vname) combinations
        unique_villages = {(b.ac_no, b.village_code, b.village_name) for b in all_booths if b.village_name or b.village_code}

        for ac_no, vcode, vname in unique_villages:
            vid = None
            if vcode and vcode in village_by_code:
                vid = village_by_code[vcode]
            elif (ac_no, norm(vname)) in village_by_ac_norm:
                vid = village_by_ac_norm[(ac_no, norm(vname))]
                # If existing village has no village_code, update it if vcode is not already assigned
                if vcode and vid not in village_code_by_id and vcode not in village_by_code:
                    village_codes_to_update.append((vcode, vid))
                    village_code_by_id[vid] = vcode
                    village_by_code[vcode] = vid
                    stats["village_codes_updated"] += 1
            else:
                # Needs insertion: Ensure vcode does not collide with existing unique index
                safe_vcode = vcode if (vcode and vcode not in village_by_code) else None
                villages_to_insert.append((ac_no, vname or f"VILLAGE_{vcode}", safe_vcode))
                if safe_vcode:
                    village_by_code[safe_vcode] = -1

        logger.info(
            "Villages analysis: %d to insert, %d to update village_code",
            len(villages_to_insert), len(village_codes_to_update)
        )

        if not dry_run:
            if village_codes_to_update:
                await conn.executemany(
                    "UPDATE villages SET village_code = $1 WHERE village_id = $2 AND village_code IS NULL",
                    village_codes_to_update,
                )

            # Insert missing villages
            for ac_no, vname, vcode in villages_to_insert:
                vid = None
                try:
                    row = await conn.fetchrow(
                        """
                        INSERT INTO villages (ac_no, name, village_code)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (ac_no, name) DO UPDATE SET village_code = COALESCE(villages.village_code, EXCLUDED.village_code)
                        RETURNING village_id
                        """,
                        ac_no, vname, vcode,
                    )
                    if row:
                        vid = row["village_id"]
                except Exception:
                    row = await conn.fetchrow(
                        """
                        INSERT INTO villages (ac_no, name)
                        VALUES ($1, $2)
                        ON CONFLICT (ac_no, name) DO NOTHING
                        RETURNING village_id
                        """,
                        ac_no, vname,
                    )
                    if row:
                        vid = row["village_id"]
                    else:
                        vid = await conn.fetchval("SELECT village_id FROM villages WHERE ac_no = $1 AND name = $2", ac_no, vname)

                if vid:
                    village_by_ac_norm[(ac_no, norm(vname))] = vid
                    if vcode:
                        village_by_code[vcode] = vid
                        village_code_by_id[vid] = vcode
                    stats["villages_created"] += 1

        # 4. Cache election_booths: (election_id, ac_no, booth_no) -> booth_id
        b_rows = await conn.fetch("SELECT booth_id, election_id, ac_no, booth_no, village_id FROM election_booths")
        existing_booth_map: dict[tuple[int, int, str], dict[str, Any]] = {
            (r["election_id"], r["ac_no"], str(r["booth_no"]).strip()): dict(r) for r in b_rows
        }

        # 5. Process Booths & Results
        booths_to_insert: list[ParsedBooth] = []
        booths_to_update: list[tuple[int | None, str, int, int]] = []  # (village_id, source_file, source_line, booth_id)
        results_to_upsert: list[tuple] = []

        for b in all_booths:
            # Resolve village_id
            vid = None
            if b.village_code and b.village_code in village_by_code:
                vid = village_by_code[b.village_code]
            elif (b.ac_no, norm(b.village_name)) in village_by_ac_norm:
                vid = village_by_ac_norm[(b.ac_no, norm(b.village_name))]

            key = (b.election_id, b.ac_no, b.booth_no)
            existing_b = existing_booth_map.get(key)

            if existing_b:
                bid = existing_b["booth_id"]
                curr_vid = existing_b.get("village_id")
                # Update village if previously null or new vid resolved
                target_vid = vid or curr_vid
                booths_to_update.append((target_vid, b.source_file, b.source_line, bid))
                stats["booths_updated"] += 1
            else:
                booths_to_insert.append(b)
                stats["booths_created"] += 1

        logger.info(
            "Booths plan: %d existing booths to update, %d new booths to create",
            len(booths_to_update), len(booths_to_insert)
        )

        if not dry_run:
            # Update existing booths in chunks
            if booths_to_update:
                chunk_size = 5000
                for i in range(0, len(booths_to_update), chunk_size):
                    chunk = booths_to_update[i : i + chunk_size]
                    await conn.executemany(
                        """
                        UPDATE election_booths
                        SET village_id = COALESCE($1, village_id),
                            source_file = $2,
                            source_line = $3
                        WHERE booth_id = $4
                        """,
                        chunk,
                    )

            # Insert missing booths
            for b in booths_to_insert:
                vid = None
                if b.village_code and b.village_code in village_by_code:
                    vid = village_by_code[b.village_code]
                elif (b.ac_no, norm(b.village_name)) in village_by_ac_norm:
                    vid = village_by_ac_norm[(b.ac_no, norm(b.village_name))]

                bid = await conn.fetchval(
                    """
                    INSERT INTO election_booths (election_id, ac_no, booth_no, village_id, source_file, source_line)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING booth_id
                    """,
                    b.election_id, b.ac_no, b.booth_no, vid, b.source_file, b.source_line,
                )
                existing_booth_map[(b.election_id, b.ac_no, b.booth_no)] = {"booth_id": bid, "village_id": vid}

            # Now prepare all results to upsert with strict >= 0 clamping
            for b in all_booths:
                key = (b.election_id, b.ac_no, b.booth_no)
                eb = existing_booth_map.get(key)
                if not eb:
                    continue
                bid = eb["booth_id"]

                b_elec = max(0, b.electors)
                b_polled = max(0, b.votes_polled)
                b_valid = max(0, b.valid_votes)
                b_bjp = max(0, b.votes_bjp)
                b_rld = max(0, b.votes_rld)
                b_sp = max(0, b.votes_samajwadi)
                b_bsp = max(0, b.votes_bsp)
                b_inc = max(0, b.votes_inc)
                b_aap = max(0, b.votes_aap)
                b_aimim = max(0, b.votes_aimim)
                b_asp = max(0, b.votes_asp)
                b_ind = max(0, b.votes_ind)
                b_nota = max(0, b.votes_nota)
                b_other_nota = max(0, b.votes_other_nota)

                denom = b_valid if b_valid > 0 else (b_polled if b_polled > 0 else 1)
                s_bjp = round(min(1.0, max(0.0, b_bjp / denom)), 4)
                s_rld = round(min(1.0, max(0.0, b_rld / denom)), 4)
                s_sp = round(min(1.0, max(0.0, b_sp / denom)), 4)
                s_bsp = round(min(1.0, max(0.0, b_bsp / denom)), 4)
                s_inc = round(min(1.0, max(0.0, b_inc / denom)), 4)
                s_aap = round(min(1.0, max(0.0, b_aap / denom)), 4)
                s_aimim = round(min(1.0, max(0.0, b_aimim / denom)), 4)
                s_asp = round(min(1.0, max(0.0, b_asp / denom)), 4)
                s_ind = round(min(1.0, max(0.0, b_ind / denom)), 4)
                s_nota = round(min(1.0, max(0.0, b_nota / denom)), 4)

                results_to_upsert.append((
                    bid, b_elec, b_polled, b_valid,
                    b_bjp, s_bjp, b_rld, s_rld,
                    b_sp, s_sp, b_bsp, s_bsp,
                    b_inc, s_inc, b_aap, s_aap,
                    b_aimim, s_aimim, b_asp, s_asp,
                    b_ind, s_ind, b_nota, s_nota,
                    b_other_nota,
                ))

            # Batch upsert results in chunks of 5000
            chunk_size = 5000
            for i in range(0, len(results_to_upsert), chunk_size):
                chunk = results_to_upsert[i : i + chunk_size]
                await conn.executemany(
                    """
                    INSERT INTO public.booth_results (
                        booth_id, electors, votes_polled, valid_votes,
                        votes_bjp, share_bjp, votes_rld, share_rld,
                        votes_samajwadi, share_samajwadi, votes_bsp, share_bsp,
                        votes_inc, share_inc, votes_aap, share_aap,
                        votes_aimim, share_aimim, votes_asp, share_asp,
                        votes_ind, share_ind, votes_nota, share_nota,
                        votes_other_nota
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                        $21, $22, $23, $24, $25
                    )
                    ON CONFLICT (booth_id) DO UPDATE SET
                        electors = EXCLUDED.electors,
                        votes_polled = EXCLUDED.votes_polled,
                        valid_votes = EXCLUDED.valid_votes,
                        votes_bjp = EXCLUDED.votes_bjp,
                        share_bjp = EXCLUDED.share_bjp,
                        votes_rld = EXCLUDED.votes_rld,
                        share_rld = EXCLUDED.share_rld,
                        votes_samajwadi = EXCLUDED.votes_samajwadi,
                        share_samajwadi = EXCLUDED.share_samajwadi,
                        votes_bsp = EXCLUDED.votes_bsp,
                        share_bsp = EXCLUDED.share_bsp,
                        votes_inc = EXCLUDED.votes_inc,
                        share_inc = EXCLUDED.share_inc,
                        votes_aap = EXCLUDED.votes_aap,
                        share_aap = EXCLUDED.share_aap,
                        votes_aimim = EXCLUDED.votes_aimim,
                        share_aimim = EXCLUDED.share_aimim,
                        votes_asp = EXCLUDED.votes_asp,
                        share_asp = EXCLUDED.share_asp,
                        votes_ind = EXCLUDED.votes_ind,
                        share_ind = EXCLUDED.share_ind,
                        votes_nota = EXCLUDED.votes_nota,
                        share_nota = EXCLUDED.share_nota,
                        votes_other_nota = EXCLUDED.votes_other_nota
                    """,
                    chunk,
                )
                stats["results_upserted"] += len(chunk)
                logger.info("Upserted %d / %d booth results", stats["results_upserted"], len(results_to_upsert))

        # Final Summary
        total_booths_after = await conn.fetchval("SELECT COUNT(*) FROM election_booths")
        total_results_after = await conn.fetchval("SELECT COUNT(*) FROM booth_results")
        total_villages_after = await conn.fetchval("SELECT COUNT(*) FROM villages")

        logger.info("\n" + "=" * 60)
        logger.info("SEEDING PIPELINE COMPLETED (%s)", "DRY-RUN" if dry_run else "APPLIED")
        logger.info("  Villages: %d -> %d (+%d)", total_villages_before, total_villages_after, total_villages_after - total_villages_before)
        logger.info("  Booths  : %d -> %d (+%d)", total_booths_before, total_booths_after, total_booths_after - total_booths_before)
        logger.info("  Results : %d -> %d (+%d)", total_results_before, total_results_after, total_results_after - total_results_before)
        logger.info("  Stats: %s", stats)
        logger.info("=" * 60)

    finally:
        await conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed Booth DATA UP into database")
    parser.add_argument("--apply", action="store_true", help="Apply changes directly to PostgreSQL")
    parser.add_argument("--dry-run", action="store_true", help="Dry run without modifying database")
    args = parser.parse_args()

    if not args.apply and not args.dry_run:
        print("Please specify either --dry-run or --apply")
        sys.exit(1)

    asyncio.run(seed_booth_data(dry_run=args.dry_run))
