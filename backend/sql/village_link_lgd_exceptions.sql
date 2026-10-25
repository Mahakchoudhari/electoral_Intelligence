-- Read-only: list the unresolved village groups where the boundary LGD code
-- is absent, repeated across boundary groups, or multiple codes occur within
-- one same-AC normalized-name group.
WITH unmatched AS (
    SELECT vb.ac_no,
           regexp_replace(lower(btrim(vb.name)), '[^a-z0-9]', '', 'g') AS name_key,
           MIN(vb.name) AS boundary_name,
           MIN(vb.vil_lgd) AS vil_lgd,
           COUNT(DISTINCT vb.objectid) AS boundary_features,
           COUNT(DISTINCT vb.vil_lgd) AS lgd_code_count,
           array_agg(DISTINCT vb.vil_lgd ORDER BY vb.vil_lgd)
               FILTER (WHERE vb.vil_lgd IS NOT NULL) AS lgd_codes
    FROM village_boundaries vb
    GROUP BY vb.ac_no, regexp_replace(lower(btrim(vb.name)), '[^a-z0-9]', '', 'g')
    HAVING COUNT(DISTINCT vb.village_id) FILTER (WHERE vb.village_id IS NOT NULL) = 0
), duplicate_codes AS (
    SELECT vil_lgd
    FROM unmatched
    WHERE lgd_code_count = 1 AND vil_lgd IS NOT NULL
    GROUP BY vil_lgd
    HAVING COUNT(*) > 1
)
SELECT 'multiple_lgd_codes_in_boundary_group' AS issue,
       ac_no, boundary_name, boundary_features, lgd_codes AS codes,
       NULL::BIGINT AS groups_sharing_code
FROM unmatched
WHERE lgd_code_count > 1
UNION ALL
SELECT 'lgd_code_reused_across_boundary_groups' AS issue,
       u.ac_no, u.boundary_name, u.boundary_features,
       ARRAY[u.vil_lgd] AS codes,
       (SELECT COUNT(*) FROM unmatched same_code WHERE same_code.lgd_code_count = 1 AND same_code.vil_lgd = u.vil_lgd) AS groups_sharing_code
FROM unmatched u
JOIN duplicate_codes d USING (vil_lgd)
WHERE u.lgd_code_count = 1
UNION ALL
SELECT 'missing_lgd_code' AS issue,
       ac_no, boundary_name, boundary_features,
       '{}'::BIGINT[] AS codes, NULL::BIGINT AS groups_sharing_code
FROM unmatched
WHERE lgd_code_count = 0
ORDER BY issue, ac_no, boundary_name;
