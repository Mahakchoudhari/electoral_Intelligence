-- Read-only audit for village boundary -> legacy village -> election booth links.
-- Supabase SQL Editor may show only the final result from a multi-statement script.
-- Run each numbered query separately and share its result.

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

-- 2. Exact normalized-name candidates for currently unlinked boundaries.
-- candidate_count=1 is a possible safe match; >1 requires review; 0 needs alias/manual matching.
WITH boundary_villages AS (
    SELECT vb.ac_no,
           regexp_replace(lower(btrim(vb.name)), '[^a-z0-9]', '', 'g') AS name_key,
           MIN(vb.name) AS boundary_name,
           MIN(vb.vil_lgd) AS vil_lgd,
           COUNT(DISTINCT vb.objectid) AS boundary_features
    FROM village_boundaries vb
    GROUP BY vb.ac_no, regexp_replace(lower(btrim(vb.name)), '[^a-z0-9]', '', 'g')
    HAVING COUNT(DISTINCT vb.village_id) FILTER (WHERE vb.village_id IS NOT NULL) = 0
), candidates AS (
    SELECT b.*,
           COUNT(v.village_id) AS candidate_count,
           COALESCE(array_agg(DISTINCT v.village_id ORDER BY v.village_id)
               FILTER (WHERE v.village_id IS NOT NULL), '{}'::bigint[]) AS candidate_village_ids,
           COALESCE(array_agg(DISTINCT v.name ORDER BY v.name)
               FILTER (WHERE v.village_id IS NOT NULL), '{}'::text[]) AS candidate_village_names
    FROM boundary_villages b
    LEFT JOIN villages v
      ON v.ac_no = b.ac_no
     AND regexp_replace(lower(btrim(v.name)), '[^a-z0-9]', '', 'g') = b.name_key
    GROUP BY b.ac_no, b.name_key, b.boundary_name, b.vil_lgd, b.boundary_features
)
SELECT candidate_count,
       COUNT(*) AS boundary_groups,
       SUM(boundary_features) AS boundary_feature_rows
FROM candidates
GROUP BY candidate_count
ORDER BY candidate_count;

-- 3. Candidate details, including existing booth/result counts for every exact match.
WITH boundary_villages AS (
    SELECT vb.ac_no,
           regexp_replace(lower(btrim(vb.name)), '[^a-z0-9]', '', 'g') AS name_key,
           MIN(vb.name) AS boundary_name,
           MIN(vb.vil_lgd) AS vil_lgd,
           COUNT(DISTINCT vb.objectid) AS boundary_features
    FROM village_boundaries vb
    GROUP BY vb.ac_no, regexp_replace(lower(btrim(vb.name)), '[^a-z0-9]', '', 'g')
    HAVING COUNT(DISTINCT vb.village_id) FILTER (WHERE vb.village_id IS NOT NULL) = 0
), candidates AS (
    SELECT b.*,
           COUNT(DISTINCT v.village_id) AS candidate_count,
           array_agg(DISTINCT v.village_id ORDER BY v.village_id)
               FILTER (WHERE v.village_id IS NOT NULL) AS candidate_village_ids,
           array_agg(DISTINCT v.name ORDER BY v.name)
               FILTER (WHERE v.village_id IS NOT NULL) AS candidate_village_names
    FROM boundary_villages b
    LEFT JOIN villages v
      ON v.ac_no = b.ac_no
     AND regexp_replace(lower(btrim(v.name)), '[^a-z0-9]', '', 'g') = b.name_key
    GROUP BY b.ac_no, b.name_key, b.boundary_name, b.vil_lgd, b.boundary_features
), candidate_booths AS (
    SELECT c.ac_no, c.name_key,
           COUNT(DISTINCT eb.booth_id) AS matching_booths,
           COUNT(DISTINCT br.booth_id) AS matching_booth_results
    FROM candidates c
    LEFT JOIN villages v
      ON v.ac_no = c.ac_no
     AND regexp_replace(lower(btrim(v.name)), '[^a-z0-9]', '', 'g') = c.name_key
    LEFT JOIN election_booths eb ON eb.village_id = v.village_id
    LEFT JOIN booth_results br ON br.booth_id = eb.booth_id
    GROUP BY c.ac_no, c.name_key
)
SELECT c.ac_no, c.boundary_name, c.vil_lgd, c.boundary_features,
       c.candidate_count, c.candidate_village_ids, c.candidate_village_names,
       COALESCE(cb.matching_booths, 0) AS matching_booths,
       COALESCE(cb.matching_booth_results, 0) AS matching_booth_results
FROM candidates c
LEFT JOIN candidate_booths cb USING (ac_no, name_key)
WHERE c.candidate_count > 0
ORDER BY c.candidate_count DESC, c.ac_no, c.boundary_name
;

-- 4. Election-year coverage: separate unassigned booths from missing result rows.
SELECT e.election_year,
       COUNT(*) AS booth_rows,
       COUNT(eb.village_id) AS booth_rows_with_village_id,
       COUNT(*) FILTER (WHERE eb.village_id IS NULL) AS booth_rows_without_village_id,
       COUNT(br.booth_id) AS booth_rows_with_results,
       COUNT(*) FILTER (WHERE eb.village_id IS NOT NULL AND br.booth_id IS NULL) AS linked_booths_without_results
FROM elections e
JOIN election_booths eb USING (election_id)
LEFT JOIN booth_results br USING (booth_id)
GROUP BY e.election_year
ORDER BY e.election_year DESC;

