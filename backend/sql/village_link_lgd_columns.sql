-- Read-only: inspect available columns for possible LGD or alternate-name keys.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('villages', 'village_boundaries', 'election_booths', 'staging_election_csv')
ORDER BY table_name, ordinal_position;
