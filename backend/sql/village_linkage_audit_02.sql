-- Run this query by itself in the Supabase SQL Editor. Read-only; no rows are modified.
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
