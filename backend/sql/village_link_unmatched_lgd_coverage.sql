-- Read-only: determine whether remaining unlinked boundary villages have usable
-- LGD codes, and whether codes are unique across AC/name groups.
WITH unmatched AS (
    SELECT vb.ac_no,
           regexp_replace(lower(btrim(vb.name)), '[^a-z0-9]', '', 'g') AS name_key,
           MIN(vb.name) AS boundary_name,
           COUNT(DISTINCT vb.objectid) AS boundary_features,
           COUNT(DISTINCT vb.vil_lgd) AS lgd_code_count,
           MIN(vb.vil_lgd) AS vil_lgd
    FROM village_boundaries vb
    GROUP BY vb.ac_no, regexp_replace(lower(btrim(vb.name)), '[^a-z0-9]', '', 'g')
    HAVING COUNT(DISTINCT vb.village_id) FILTER (WHERE vb.village_id IS NOT NULL) = 0
), code_usage AS (
    SELECT vil_lgd, COUNT(*) AS boundary_groups
    FROM unmatched
    WHERE lgd_code_count = 1 AND vil_lgd IS NOT NULL
    GROUP BY vil_lgd
)
SELECT
    (SELECT COUNT(*) FROM unmatched) AS unmatched_boundary_groups,
    (SELECT COALESCE(SUM(boundary_features), 0) FROM unmatched) AS unmatched_boundary_features,
    (SELECT COUNT(*) FROM unmatched WHERE lgd_code_count = 0) AS groups_without_lgd_code,
    (SELECT COUNT(*) FROM unmatched WHERE lgd_code_count = 1 AND vil_lgd IS NOT NULL) AS groups_with_one_lgd_code,
    (SELECT COUNT(*) FROM unmatched WHERE lgd_code_count > 1) AS groups_with_multiple_lgd_codes,
    (SELECT COUNT(DISTINCT vil_lgd) FROM unmatched WHERE lgd_code_count = 1 AND vil_lgd IS NOT NULL) AS distinct_lgd_codes,
    (SELECT COUNT(*) FROM code_usage WHERE boundary_groups > 1) AS lgd_codes_used_by_multiple_boundary_groups;
