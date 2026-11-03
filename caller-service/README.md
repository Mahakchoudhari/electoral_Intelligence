# Caller Service

Standalone FastAPI microservice for the independently deployed caller React
app. It connects to the existing PostgreSQL database and writes each call to
`public."call"`, which the existing Electoral Intelligence dashboard reads.

## Run locally

```bash
cd caller-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
set -a && source .env && set +a
psql "$DATABASE_URL" -f sql/001_caller_admin.sql
uvicorn app.main:app --reload --port 8001
```

Callers create accounts from the signup page. Accounts are stored in
`call_centre_user`; passwords are hashed with PBKDF2-HMAC-SHA256 using a
cryptographically random per-user salt. The salt and hash are stored in the
schema's `salt` and `hashed_password` columns. Login sessions are bearer tokens
held in process memory for 12 hours. Configure `CALLER_FRONTEND_ORIGINS` for
the deployed React app.
The service exposes `/api/caller/signup`, `/login`, `/districts`,
`/assemblies`, `/villages`, `/sampark-sutras`, `/calls`, and the admin-only
`/admin/activity` endpoint under the `/api/caller` prefix.

## Database

Set `DATABASE_URL` to the same database used by the existing dashboard. The
database must have the current `public."call"` columns used by its existing
webhook integration (`provider`, `provider_call_id`, and the area/report
columns). The migration adds `call_centre_user.role` and
`public."call".caller_pid`, with an index for daily activity queries. New calls
store the authenticated caller's `pid`; pre-existing rows remain unassigned.
The service uses the current `districts`, `ac`, `villages`, and
`sampark_sutra` tables and validates that the selected contact belongs to the
submitted village and assembly before saving.

## Admin access

Sign up for a normal caller account in the app, then promote the designated
account using a database administrator connection:

```sql
UPDATE public.call_centre_user
SET role = 'admin'
WHERE username = 'your-admin-username';
```

Sign out and use **Admin sign in**. The admin console groups logged calls by
caller and India-local day, shows call and issue totals, filters by date range
or caller, and refreshes automatically every 30 seconds. Admin requests
re-check the account's current database role.

## Seed Sampark Sutra rosters

From the repository root, preview then import roster files (.csv, .xlsx) from `sampark_sutra/`:

```bash
python seed_sampark_sutra.py --dry-run
python seed_sampark_sutra.py
```

The script reads `DATABASE_URL` from the process environment, `backend/.env`, or
`caller-service/.env`. By default, it scans `sampark_sutra/` for all roster files.
Entries without a usable phone number or without a village name are dropped.
Locality names are matched within their AC; unmatched village/ward labels are
created in `villages` so callers can select them. Use `--input-dir PATH
--recursive` for rosters stored under another folder, `--files FILE.csv` to
select specific files, and `--ac-map map.json` to map unrecognized assembly
labels to database `ac_no` values.

