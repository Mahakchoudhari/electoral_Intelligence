-- Read-only check: can raw election CSV village names be joined back to the
-- finalized booths using source_file + source_line?
SELECT COUNT(DISTINCT s.staging_id) AS staging_rows,
       COUNT(DISTINCT s.staging_id) FILTER (WHERE NULLIF(btrim(s.village), '') IS NOT NULL) AS rows_with_village_name,
       COUNT(DISTINCT s.staging_id) FILTER (WHERE eb.booth_id IS NOT NULL) AS rows_linked_to_election_booth,
       COUNT(DISTINCT s.staging_id) FILTER (WHERE eb.village_id IS NOT NULL) AS rows_with_final_village_id,
       COUNT(DISTINCT s.staging_id) FILTER (WHERE br.booth_id IS NOT NULL) AS rows_with_booth_results,
       COUNT(DISTINCT (s.source_file, s.source_line)) AS distinct_source_rows,
       COUNT(DISTINCT (eb.source_file, eb.source_line)) AS distinct_final_booth_source_rows
FROM staging_election_csv s
LEFT JOIN election_booths eb
  ON eb.source_file = s.source_file
 AND eb.source_line = s.source_line
 AND eb.ac_no::text = s.ac_no
LEFT JOIN booth_results br ON br.booth_id = eb.booth_id;
