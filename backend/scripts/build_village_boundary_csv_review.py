#!/usr/bin/env python3
"""Build a reviewable boundary-to-CSV-village candidate crosswalk.

The report is intentionally a candidate list, not an apply script. It uses
the selected 16-district village GeoJSON and the reviewed 2022 booth CSV.
2017 booth village values are Hindi-script and need a separate cross-year
crosswalk; they are not silently guessed here.
"""

from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

try:
    from rapidfuzz import fuzz
except ImportError as exc:  # pragma: no cover - only used by this data utility
    raise SystemExit("Install rapidfuzz to build the review report: pip install rapidfuzz") from exc


ROOT = Path(__file__).resolve().parents[2]
BOUNDARY_FILE = ROOT / "UTTAR_PRADESH_VILLAGES_Selected.geojson"
CSV_FILE = ROOT / "csv_data" / "ALL_AC_2022_cleaned_master.csv"
DISTRICT_FILE = ROOT / "backend" / "app" / "data_files" / "up_selected_16_districts.geojson"
OUTPUT_FILE = ROOT / "backend" / "app" / "data_files" / "village_boundary_csv_candidate_review.csv"
SUMMARY_FILE = ROOT / "backend" / "app" / "data_files" / "village_boundary_csv_candidate_review_summary.txt"


def normalize(value: Any) -> str:
    words = re.findall(r"[a-z0-9]+", str(value or "").lower())
    # These are transliteration variants found in the supplied Baraut CSV.
    words = ["chodhran" if word == "chaudhran" else word for word in words]
    return " ".join(words)


def load_selected_district_lgds() -> set[int]:
    data = json.loads(DISTRICT_FILE.read_text(encoding="utf-8"))
    return {int(feature["properties"]["Dist_LGD"]) for feature in data["features"]}


def token_set(value: str) -> set[str]:
    return set(value.split())


def main() -> None:
    selected_lgds = load_selected_district_lgds()
    boundary_data = json.loads(BOUNDARY_FILE.read_text(encoding="utf-8"))

    grouped_boundaries: dict[tuple[int, str], dict[str, Any]] = {}
    for feature in boundary_data["features"]:
        props = feature.get("properties") or {}
        if int(props.get("dist_lgd") or 0) not in selected_lgds:
            continue
        ac_no = int(props["ac_no"])
        boundary_name = str(props.get("vilname11") or "").strip()
        group_key = normalize(boundary_name).replace(" ", "")
        key = (ac_no, group_key)
        group = grouped_boundaries.setdefault(
            key,
            {
                "ac_no": ac_no,
                "district": props.get("dtname") or "",
                "vil_lgd": set(),
                "boundary_names": set(),
                "alternate_names": set(),
                "objectids": set(),
            },
        )
        if props.get("vil_lgd") is not None:
            group["vil_lgd"].add(int(props["vil_lgd"]))
        if boundary_name:
            group["boundary_names"].add(boundary_name)
        alternate = str(props.get("vilnam_soi") or "").strip()
        if alternate:
            group["alternate_names"].add(alternate)
        if props.get("objectid") is not None:
            group["objectids"].add(int(props["objectid"]))

    csv_labels: dict[int, dict[str, dict[str, Any]]] = defaultdict(dict)
    blank_rows = 0
    with CSV_FILE.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            label = str(row.get("village") or "").strip()
            if not label:
                blank_rows += 1
                continue
            ac_no = int(row["ac_no"])
            key = normalize(label)
            item = csv_labels[ac_no].setdefault(
                key,
                {"labels": set(), "booths": set(), "confidences": [], "rows": 0},
            )
            item["labels"].add(label)
            item["booths"].add(str(row.get("booth_no") or "").strip())
            try:
                item["confidences"].append(float(row.get("village_confidence") or 0))
            except ValueError:
                pass
            item["rows"] += 1

    summary = {
        "boundary_groups": len(grouped_boundaries),
        "groups_with_strict_candidates": 0,
        "groups_with_one_strict_label": 0,
        "groups_with_multiple_strict_labels": 0,
        "candidate_label_links": 0,
        "groups_with_fuzzy_review_candidates": 0,
        "groups_without_candidate_at_65": 0,
        "blank_2022_village_rows": blank_rows,
    }

    with OUTPUT_FILE.open("w", encoding="utf-8", newline="") as output:
        fields = [
            "ac_no", "district", "vil_lgd_codes", "boundary_name", "alternate_names",
            "boundary_features", "csv_village_label", "booth_count_2022", "booth_numbers_2022",
            "csv_village_confidence_min", "candidate_score", "match_basis", "candidate_group_status",
        ]
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()

        for (ac_no, _), boundary in sorted(grouped_boundaries.items()):
            aliases = sorted(boundary["boundary_names"] | boundary["alternate_names"])
            alias_norms = [normalize(alias) for alias in aliases if normalize(alias)]
            alias_tokens = [token_set(alias) for alias in alias_norms]
            candidates = []
            for label_key, source in csv_labels.get(ac_no, {}).items():
                source_tokens = token_set(label_key)
                scores = [fuzz.token_set_ratio(alias, label_key) for alias in alias_norms]
                score = max(scores, default=0)
                exact_token_set = any(tokens == source_tokens for tokens in alias_tokens)
                contained_alias = any(len(tokens) >= 3 and tokens <= source_tokens for tokens in alias_tokens)
                strict = exact_token_set or contained_alias
                basis = "exact_token_set" if exact_token_set else "alias_tokens_contained" if contained_alias else "fuzzy_review"
                if strict or score >= 65:
                    candidates.append((strict, score, basis, label_key, source))

            strict_candidates = [candidate for candidate in candidates if candidate[0]]
            if strict_candidates:
                summary["groups_with_strict_candidates"] += 1
                summary["candidate_label_links"] += len(strict_candidates)
                if len(strict_candidates) == 1:
                    summary["groups_with_one_strict_label"] += 1
                    chosen = strict_candidates
                    status = "strict_single_label_candidate"
                else:
                    summary["groups_with_multiple_strict_labels"] += 1
                    chosen = strict_candidates
                    status = "strict_multiple_labels_review"
            else:
                fuzzy_candidates = [candidate for candidate in candidates if candidate[1] >= 65]
                if fuzzy_candidates:
                    summary["groups_with_fuzzy_review_candidates"] += 1
                    chosen = sorted(fuzzy_candidates, key=lambda candidate: (-candidate[1], candidate[3]))[:3]
                    status = "fuzzy_review_only"
                else:
                    summary["groups_without_candidate_at_65"] += 1
                    chosen = []
                    status = "no_2022_candidate_at_65"

            if not chosen:
                writer.writerow({
                    "ac_no": ac_no,
                    "district": boundary["district"],
                    "vil_lgd_codes": ";".join(map(str, sorted(boundary["vil_lgd"]))),
                    "boundary_name": " | ".join(sorted(boundary["boundary_names"])),
                    "alternate_names": " | ".join(sorted(boundary["alternate_names"])),
                    "boundary_features": len(boundary["objectids"]),
                    "csv_village_label": "",
                    "booth_count_2022": 0,
                    "booth_numbers_2022": "",
                    "csv_village_confidence_min": "",
                    "candidate_score": 0,
                    "match_basis": "none",
                    "candidate_group_status": status,
                })
                continue

            for _, score, basis, _, source in chosen:
                original_labels = sorted(source["labels"])
                conf = min(source["confidences"]) if source["confidences"] else ""
                for label in original_labels:
                    writer.writerow({
                        "ac_no": ac_no,
                        "district": boundary["district"],
                        "vil_lgd_codes": ";".join(map(str, sorted(boundary["vil_lgd"]))),
                        "boundary_name": " | ".join(sorted(boundary["boundary_names"])),
                        "alternate_names": " | ".join(sorted(boundary["alternate_names"])),
                        "boundary_features": len(boundary["objectids"]),
                        "csv_village_label": label,
                        "booth_count_2022": source["rows"],
                        "booth_numbers_2022": ";".join(sorted(source["booths"], key=lambda value: (not value.isdigit(), int(value) if value.isdigit() else value))),
                        "csv_village_confidence_min": conf,
                        "candidate_score": round(score, 1),
                        "match_basis": basis,
                        "candidate_group_status": status,
                    })

    summary_lines = [
        "Boundary-to-CSV candidate review (selected 16 districts)",
        "Source: UTTAR_PRADESH_VILLAGES_Selected.geojson and csv_data/ALL_AC_2022_cleaned_master.csv",
        "2017 labels are Hindi-script and are not auto-linked by this Latin-name report.",
        "",
        *[f"{key}: {value}" for key, value in summary.items()],
        "",
        "Strict candidates are name-token candidates only; they still need the database collision checks.",
        "Fuzzy candidates are review suggestions and are not safe to apply automatically.",
    ]
    SUMMARY_FILE.write_text("\n".join(summary_lines) + "\n", encoding="utf-8")
    print("Wrote", OUTPUT_FILE)
    print("Wrote", SUMMARY_FILE)
    print("\n".join(summary_lines[3:]))


if __name__ == "__main__":
    main()
