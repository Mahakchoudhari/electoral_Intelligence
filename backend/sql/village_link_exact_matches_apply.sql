-- Links only unlinked boundary rows with one exact normalized village-name
-- match inside the same AC. The preflight asserts the audit counts provided
-- on 2026-10-25; the transaction aborts if the database has changed.
-- Expected effect: 494 village_boundaries rows receive village_id values.
-- The 931 booths/results in the full CSV include 5 booths from the two
-- ambiguous groups; unique candidates alone account for 926 booths/results.
BEGIN;

CREATE TEMP TABLE village_link_candidate_audit ON COMMIT DROP AS
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
           MIN(v.village_id) AS candidate_village_id
    FROM boundary_villages b
    LEFT JOIN villages v
      ON v.ac_no = b.ac_no
     AND regexp_replace(lower(btrim(v.name)), '[^a-z0-9]', '', 'g') = b.name_key
    GROUP BY b.ac_no, b.name_key, b.boundary_name, b.vil_lgd, b.boundary_features
), candidate_metrics AS (
    SELECT c.*,
           COUNT(DISTINCT eb.booth_id) AS matching_booths,
           COUNT(DISTINCT br.booth_id) AS matching_booth_results
    FROM candidates c
    LEFT JOIN election_booths eb
      ON c.candidate_count = 1 AND eb.village_id = c.candidate_village_id
    LEFT JOIN booth_results br ON br.booth_id = eb.booth_id
    GROUP BY c.ac_no, c.name_key, c.boundary_name, c.vil_lgd,
             c.boundary_features, c.candidate_count, c.candidate_village_id
)
SELECT * FROM candidate_metrics;

DO $$
DECLARE
    unique_groups BIGINT;
    unique_ids BIGINT;
    unique_features BIGINT;
    unique_booths BIGINT;
    unique_results BIGINT;
    ambiguous_groups BIGINT;
    unmatched_groups BIGINT;
BEGIN
    SELECT COUNT(*) FILTER (WHERE candidate_count = 1),
           COUNT(DISTINCT candidate_village_id) FILTER (WHERE candidate_count = 1),
           COALESCE(SUM(boundary_features) FILTER (WHERE candidate_count = 1), 0),
           COALESCE(SUM(matching_booths) FILTER (WHERE candidate_count = 1), 0),
           COALESCE(SUM(matching_booth_results) FILTER (WHERE candidate_count = 1), 0),
           COUNT(*) FILTER (WHERE candidate_count > 1),
           COUNT(*) FILTER (WHERE candidate_count = 0)
    INTO unique_groups, unique_ids, unique_features, unique_booths,
         unique_results, ambiguous_groups, unmatched_groups
    FROM village_link_candidate_audit;

    IF unique_groups <> 445 OR unique_ids <> 445 OR unique_features <> 494
       OR unique_booths <> 926 OR unique_results <> 926
       OR ambiguous_groups <> 2 OR unmatched_groups <> 11527 THEN
        RAISE EXCEPTION
          'Preflight changed; no rows updated. Got unique groups/IDs/features/booths/results= %/%/%/%/%, ambiguous=%, unmatched=%.',
          unique_groups, unique_ids, unique_features, unique_booths,
          unique_results, ambiguous_groups, unmatched_groups;
    END IF;
END $$;

CREATE TEMP TABLE village_link_update_result (linked_boundary_features BIGINT);

WITH updated AS (
    UPDATE village_boundaries vb
       SET village_id = plan.candidate_village_id
      FROM village_link_candidate_audit plan
     WHERE plan.candidate_count = 1
       AND vb.ac_no = plan.ac_no
       AND regexp_replace(lower(btrim(vb.name)), '[^a-z0-9]', '', 'g') = plan.name_key
       AND vb.village_id IS NULL
    RETURNING vb.objectid
)
INSERT INTO village_link_update_result
SELECT COUNT(*) FROM updated;

COMMIT;

SELECT linked_boundary_features FROM village_link_update_result;
