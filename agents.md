# Election GIS Database Schema — Relevant Tables

Extracted from the existing Supabase PostgreSQL database. This is a reference schema for the AI agent, not a migration to execute blindly. The existing database may already contain these tables and indexes.

```sql
-- =========================================================
-- 1. ELECTIONS
-- =========================================================
CREATE TABLE public.elections (
    election_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    election_year INTEGER NOT NULL,
    election_type TEXT NOT NULL DEFAULT 'assembly',
    election_name TEXT
);

-- =========================================================
-- 2. DISTRICTS
-- =========================================================
CREATE TABLE public.districts (
    district_code INTEGER PRIMARY KEY,
    district_lgd BIGINT UNIQUE,
    name TEXT NOT NULL,
    state_code TEXT,
    state_name TEXT,
    gis_boundary geometry NOT NULL,
    source_properties JSONB NOT NULL
);

-- =========================================================
-- 3. ASSEMBLY CONSTITUENCIES (AC)
-- =========================================================
CREATE TABLE public.ac (
    ac_no BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    gis_boundary geometry(MultiPolygon, 4326),
    location geometry(Point, 4326),
    district_code INTEGER REFERENCES public.districts(district_code),
    geojson_name TEXT,
    geojson_properties JSONB
);

-- =========================================================
-- 4. POLITICAL PARTIES
-- =========================================================
CREATE TABLE public.parties (
    party_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    abbreviation TEXT UNIQUE
);

-- =========================================================
-- 5. CANDIDATES
-- =========================================================
CREATE TABLE public.candidates (
    candidate_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    party_id BIGINT REFERENCES public.parties(party_id)
);

-- =========================================================
-- 6. CANDIDATE RESULTS BY ELECTION AND AC
-- =========================================================
CREATE TABLE public.election_candidates (
    election_id BIGINT NOT NULL REFERENCES public.elections(election_id),
    ac_no BIGINT NOT NULL REFERENCES public.ac(ac_no),
    candidate_id BIGINT NOT NULL REFERENCES public.candidates(candidate_id),
    votes_received BIGINT CHECK (
        votes_received IS NULL OR votes_received >= 0
    ),
    PRIMARY KEY (election_id, ac_no, candidate_id)
);

-- =========================================================
-- 7. POLLING STATIONS
-- =========================================================
CREATE TABLE public.polling_stations (
    ps_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ac_no BIGINT NOT NULL REFERENCES public.ac(ac_no),
    name TEXT NOT NULL,
    location geometry(Point, 4326)
);

-- =========================================================
-- 8. VILLAGES
-- =========================================================
CREATE TABLE public.villages (
    village_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ac_no BIGINT NOT NULL REFERENCES public.ac(ac_no),
    name TEXT NOT NULL,
    gis_object geometry(MultiPolygon, 4326),
    sentiment TEXT
);

-- =========================================================
-- 9. VILLAGE GIS BOUNDARIES
-- =========================================================
CREATE TABLE public.village_boundaries (
    objectid BIGINT PRIMARY KEY,
    village_id BIGINT REFERENCES public.villages(village_id),
    ac_no BIGINT NOT NULL REFERENCES public.ac(ac_no),
    district_code INTEGER NOT NULL REFERENCES public.districts(district_code),
    vil_lgd BIGINT,
    name TEXT NOT NULL,
    alternate_name TEXT,
    gis_object geometry NOT NULL,
    source_properties JSONB NOT NULL
);

-- =========================================================
-- 10. ELECTION BOOTHS
-- =========================================================
CREATE TABLE public.election_booths (
    booth_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    election_id BIGINT NOT NULL REFERENCES public.elections(election_id),
    ac_no BIGINT NOT NULL REFERENCES public.ac(ac_no),
    booth_no TEXT NOT NULL,
    ps_id BIGINT REFERENCES public.polling_stations(ps_id),
    village_id BIGINT REFERENCES public.villages(village_id),
    source_file TEXT,
    source_line INTEGER
);

-- =========================================================
-- 11. BOOTH-LEVEL VOTING RESULTS
-- =========================================================
CREATE TABLE public.booth_results (
    booth_id BIGINT PRIMARY KEY REFERENCES public.election_booths(booth_id),
    electors BIGINT CHECK (electors IS NULL OR electors >= 0),
    votes_polled BIGINT CHECK (votes_polled IS NULL OR votes_polled >= 0),
    valid_votes BIGINT CHECK (valid_votes IS NULL OR valid_votes >= 0),
    votes_bjp BIGINT CHECK (votes_bjp IS NULL OR votes_bjp >= 0),
    votes_rld BIGINT CHECK (votes_rld IS NULL OR votes_rld >= 0),
    votes_samajwadi BIGINT CHECK (
        votes_samajwadi IS NULL OR votes_samajwadi >= 0
    ),
    votes_other_nota BIGINT CHECK (
        votes_other_nota IS NULL OR votes_other_nota >= 0
    ),
    share_bjp NUMERIC,
    share_rld NUMERIC
);

-- =========================================================
-- 12. IMPORT BATCH TRACKING
-- =========================================================
CREATE TABLE public.import_batches (
    batch_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    election_id BIGINT REFERENCES public.elections(election_id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'loading'
        CHECK (status IN ('loading', 'validated', 'completed', 'failed'))
);

-- =========================================================
-- 13. RAW CSV STAGING TABLE
-- =========================================================
CREATE TABLE public.staging_election_csv (
    staging_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id BIGINT NOT NULL REFERENCES public.import_batches(batch_id),
    source_file TEXT NOT NULL,
    ac_no TEXT,
    ac_name TEXT,
    booth_no TEXT,
    village TEXT,
    station_name_raw TEXT,
    station_name_norm TEXT,
    village_confidence TEXT,
    electors TEXT,
    votes_polled TEXT,
    valid_votes TEXT,
    votes_bjp TEXT,
    votes_rld TEXT,
    votes_itemised TEXT,
    votes_other_nota TEXT,
    share_bjp TEXT,
    share_rld TEXT,
    source_line INTEGER
);

-- =========================================================
-- 14. CALL-CENTRE USERS
-- =========================================================
CREATE TABLE public.call_centre_user (
    pid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username TEXT UNIQUE,
    hashed_password TEXT,
    salt TEXT
);

-- =========================================================
-- 15. SAMPARK SUTRA USERS
-- =========================================================
CREATE TABLE public.sampark_sutra (
    sid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ac_no BIGINT REFERENCES public.ac(ac_no),
    phone TEXT UNIQUE,
    hashed_password TEXT,
    salt TEXT,
    name TEXT,
    flag TEXT
);

-- =========================================================
-- 16. REPORTED PROBLEMS
-- =========================================================
CREATE TABLE public.problems (
    pid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reported_by BIGINT REFERENCES public.call_centre_user(pid),
    sid BIGINT REFERENCES public.sampark_sutra(sid),
    ac_no BIGINT NOT NULL REFERENCES public.ac(ac_no),
    text TEXT,
    image TEXT,
    location geometry,
    flag TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Important existing index/constraint information

The original database may have indexes and constraints not shown in the simplified definitions above. Preserve them when querying or modifying the live schema.

Known importer-related indexes:
- `uq_village_ac_name` — unique index on `villages(ac_no, name)`.
- `uq_polling_station_ac_name` — intended unique index on `polling_stations(ac_no, name)`.
- A partial unique index on `election_booths(election_id, ac_no, source_file, source_line)` for rows where both source fields are non-null.

The previous schema also had a unique constraint on `(election_id, ac_no, booth_no)` that was removed or intended to be removed to support repeated booth numbers. Verify the live database before making further changes.

