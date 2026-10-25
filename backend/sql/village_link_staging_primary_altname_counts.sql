-- Read-only: compare exact raw-election village labels with both boundary
-- primary and alternate names. The earlier audit checked only primary name.
WITH boundary_villages AS (
    SELECT vb.ac_no,
           regexp_replace(lower(btrim(vb.name)), '[^a-z0-9]', '', 'g') AS primary_key,
           MIN(vb.name) AS boundary_name,
           array_agg(DISTINCT regexp_replace(lower(btrim(vb.alternate_name)), '[^a-z0-9]', '', 'g'))
               FILTER (WHERE NULLIF(regexp_replace(lower(btrim(vb.alternate_name)), '[^a-z0-9]', '', 'g'), '') IS NOT NULL) AS alternate_keys,
           MIN(vb.alternate_name) AS alternate_name,
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
), counts AS (
    SELECT b.*,
           (SELECT COUNT(DISTINCT s.village_id) FROM source_links s
             WHERE s.ac_no = b.ac_no AND s.name_key = b.primary_key) AS primary_candidate_count,
           (SELECT COUNT(DISTINCT s.village_id) FROM source_links s
             WHERE s.ac_no = b.ac_no AND s.name_key = ANY(COALESCE(b.alternate_keys, ARRAY[]::text[]))) AS alternate_candidate_count
    FROM boundary_villages b
    WHERE b.primary_key <> ''
), distributions AS (
    SELECT 'primary_name' AS matched_field, primary_candidate_count AS candidate_count, boundary_features
    FROM counts
    UNION ALL
    SELECT 'alternate_name', alternate_candidate_count, boundary_features
    FROM counts
    WHERE COALESCE(cardinality(alternate_keys), 0) > 0
)
SELECT matched_field, candidate_count,
       COUNT(*) AS boundary_groups,
       SUM(boundary_features) AS boundary_feature_rows
FROM distributions
GROUP BY matched_field, candidate_count
ORDER BY matched_field, candidate_count;
