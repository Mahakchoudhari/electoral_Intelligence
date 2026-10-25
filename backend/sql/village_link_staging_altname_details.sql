-- Read-only: exact matches between remaining boundary alternate names and raw
-- election CSV village labels, with candidate IDs and booth-result coverage.
WITH boundary_villages AS (
    SELECT vb.ac_no,
           regexp_replace(lower(btrim(vb.name)), '[^a-z0-9]', '', 'g') AS primary_key,
           MIN(vb.name) AS boundary_name,
           array_agg(DISTINCT regexp_replace(lower(btrim(vb.alternate_name)), '[^a-z0-9]', '', 'g'))
               FILTER (WHERE NULLIF(regexp_replace(lower(btrim(vb.alternate_name)), '[^a-z0-9]', '', 'g'), '') IS NOT NULL) AS alternate_keys,
           MIN(vb.alternate_name) AS alternate_name,
           MIN(vb.vil_lgd) AS vil_lgd,
           COUNT(DISTINCT vb.objectid) AS boundary_features
    FROM village_boundaries vb
    GROUP BY vb.ac_no, regexp_replace(lower(btrim(vb.name)), '[^a-z0-9]', '', 'g')
    HAVING COUNT(DISTINCT vb.village_id) FILTER (WHERE vb.village_id IS NOT NULL) = 0
), source_links AS (
    SELECT DISTINCT eb.ac_no,
           regexp_replace(lower(btrim(s.village)), '[^a-z0-9]', '', 'g') AS name_key,
           eb.village_id,
           eb.booth_id,
           br.booth_id AS result_booth_id
    FROM staging_election_csv s
    JOIN election_booths eb
      ON eb.source_file = s.source_file
     AND eb.source_line = s.source_line
     AND eb.ac_no::text = s.ac_no
    LEFT JOIN booth_results br ON br.booth_id = eb.booth_id
    WHERE eb.village_id IS NOT NULL
      AND NULLIF(regexp_replace(lower(btrim(s.village)), '[^a-z0-9]', '', 'g'), '') IS NOT NULL
), matches AS (
    SELECT b.*,
           COUNT(DISTINCT s.village_id) AS candidate_count,
           array_agg(DISTINCT s.village_id ORDER BY s.village_id) AS candidate_village_ids,
           COUNT(DISTINCT s.booth_id) AS matching_booths,
           COUNT(DISTINCT s.result_booth_id) AS matching_booth_results
    FROM boundary_villages b
    JOIN source_links s
      ON s.ac_no = b.ac_no
     AND s.name_key = ANY(COALESCE(b.alternate_keys, ARRAY[]::text[]))
    WHERE b.primary_key <> ''
    GROUP BY b.ac_no, b.primary_key, b.boundary_name, b.alternate_keys,
             b.alternate_name, b.vil_lgd, b.boundary_features
)
SELECT ac_no, boundary_name, alternate_name, vil_lgd, boundary_features,
       candidate_count, candidate_village_ids,
       matching_booths, matching_booth_results
FROM matches
ORDER BY candidate_count DESC, ac_no, boundary_name;
