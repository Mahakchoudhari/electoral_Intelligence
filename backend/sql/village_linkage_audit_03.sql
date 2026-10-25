-- Run this query by itself in the Supabase SQL Editor. Read-only; no rows are modified.
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
