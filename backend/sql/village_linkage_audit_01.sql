-- Run this query by itself in the Supabase SQL Editor. Read-only; no rows are modified.
-- 1. Overall map and election linkage coverage.
WITH boundary_villages AS (
    SELECT vb.ac_no,
           regexp_replace(lower(btrim(vb.name)), '[^a-z0-9]', '', 'g') AS name_key,
           MIN(vb.name) AS boundary_name,
           MIN(vb.vil_lgd) AS vil_lgd,
           COUNT(DISTINCT vb.objectid) AS boundary_features,
           COUNT(DISTINCT vb.village_id) FILTER (WHERE vb.village_id IS NOT NULL) AS linked_village_ids
    FROM village_boundaries vb
    GROUP BY vb.ac_no, regexp_replace(lower(btrim(vb.name)), '[^a-z0-9]', '', 'g')
)
SELECT (SELECT COUNT(*) FROM village_boundaries) AS boundary_features,
       (SELECT COUNT(*) FROM boundary_villages) AS distinct_ac_village_boundaries,
       (SELECT COUNT(*) FROM boundary_villages WHERE linked_village_ids = 0) AS boundary_groups_without_village_link,
       (SELECT COUNT(*) FROM villages) AS legacy_village_rows,
       (SELECT COUNT(*) FROM election_booths) AS election_booth_rows,
       (SELECT COUNT(*) FROM election_booths WHERE village_id IS NULL) AS booths_without_village_link,
       (SELECT COUNT(*) FROM booth_results) AS booth_result_rows;
