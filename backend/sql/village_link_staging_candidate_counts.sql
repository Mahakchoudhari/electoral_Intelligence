-- Read-only audit: match remaining boundary names against raw booth CSV village
-- names inside the same AC, and count distinct linked village IDs.
WITH boundary_villages AS (
    SELECT vb.ac_no,
           regexp_replace(lower(btrim(vb.name)), '[^a-z0-9]', '', 'g') AS name_key,
           MIN(vb.name) AS boundary_name,
           MIN(vb.vil_lgd) AS vil_lgd,
           COUNT(DISTINCT vb.objectid) AS boundary_features
    FROM village_boundaries vb
    GROUP BY vb.ac_no, regexp_replace(lower(btrim(vb.name)), '[^a-z0-9]', '', 'g')
    HAVING COUNT(DISTINCT vb.village_id) FILTER (WHERE vb.village_id IS NOT NULL) = 0
), source_links AS (
    SELECT DISTINCT eb.ac_no,
           regexp_replace(lower(btrim(s.village)), '[^a-z0-9]', '', 'g') AS name_key,
           eb.village_id
    FROM staging_election_csv s
    JOIN election_booths eb
      ON eb.source_file = s.source_file
     AND eb.source_line = s.source_line
     AND eb.ac_no::text = s.ac_no
    WHERE eb.village_id IS NOT NULL
      AND NULLIF(regexp_replace(lower(btrim(s.village)), '[^a-z0-9]', '', 'g'), '') IS NOT NULL
), candidates AS (
    SELECT b.ac_no, b.name_key, b.boundary_name, b.vil_lgd, b.boundary_features,
           COUNT(DISTINCT s.village_id) AS candidate_count,
           COALESCE(array_agg(DISTINCT s.village_id ORDER BY s.village_id)
               FILTER (WHERE s.village_id IS NOT NULL), '{}'::bigint[]) AS candidate_village_ids
    FROM boundary_villages b
    LEFT JOIN source_links s ON s.ac_no = b.ac_no AND s.name_key = b.name_key
    WHERE b.name_key <> ''
    GROUP BY b.ac_no, b.name_key, b.boundary_name, b.vil_lgd, b.boundary_features
)
SELECT candidate_count,
       COUNT(*) AS boundary_groups,
       SUM(boundary_features) AS boundary_feature_rows
FROM candidates
GROUP BY candidate_count
ORDER BY candidate_count;
