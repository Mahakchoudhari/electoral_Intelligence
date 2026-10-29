# Electoral Intelligence API

FastAPI serves the dashboard GraphQL API at `/graphql`. Configure
`DATABASE_URL` before starting the service:

```bash
cd backend
uv sync
uv run --env-file .env uvicorn app.main:app --reload --port 8000
```

For Supabase's session pooler, the API uses a small per-worker `asyncpg` pool
to stay below the pooler's client limit. Defaults are `DB_POOL_MIN_SIZE=1` and
`DB_POOL_MAX_SIZE=3`; set these Render environment variables lower or higher
only after accounting for worker and instance counts.

State outlines remain file-backed from `INDIA/INDIA_STATES.geojson` (a CSV
with embedded GeoJSON geometry is also supported), configurable through
`GIS_STATES_FILE`. District, AC, and village boundaries are now read from
PostGIS.

## GIS data

The one-time import created `districts` and `village_boundaries`, linked ACs to
districts, and loaded 75 district, 403 AC, and 14,726 village boundary
features. Existing election and booth-result rows were preserved. Village
boundary features retain their original `village_id` where present. CSV-derived
booth village IDs are linked through `village_boundary_village_links`, which
supports multiple CSV village labels for one boundary. Run
`backend/sql/village_boundary_csv_links_apply.sql` in Supabase before deploying
the API change that reads this mapping.

## Dashboard queries

```graphql
query MapLayers {
  states
  districts
  assemblies
}
```

```graphql
query AssemblyDashboard($acNo: String!) {
  assemblyDashboard(acNo: $acNo)
  villages(acNo: $acNo)
}
```

The `assemblies` query accepts an optional district name and returns the AC
boundaries linked to that district. Dashboard booth totals and BJP/RLD votes
come from the latest election and `booth_results`. Party-band counts are not
represented in the schema, so those dashboard values remain unavailable.

Health check: `/health`. GraphQL explorer: `/graphql`.

## Call issue webhook contract

Run `backend/sql/call_webhook.sql` in Supabase before deploying this feature.
Set a long random `CALL_WEBHOOK_SECRET` on the API and configure the caller's
webhook to send `Authorization: Bearer <secret>` to `POST /webhooks/calls`.
The endpoint accepts call events using the payload contract below. The caller
provider's developers should map their webhook fields to these names. Set
`has_problem` from the caller-marked problem flag. Events are written to the
production `call` table; the flag is persisted there as `true` or `false`, and
only true-flagged calls appear in the dashboard.
Use a `village_id` when available; the API looks up its assembly. A known
`sid` also links through `sampark_sutra` to its village and assembly. Send
`ac_no` for assembly-only reports. If multiple area identifiers are sent, they
must agree.

```json
{
  "provider": "your-calling-provider",
  "call_id": "provider-unique-call-id",
  "occurred_at": "2026-10-29T10:30:00Z",
  "has_problem": true,
  "summary": "Street lights are not working",
  "category": "civic_issue",
  "sid": 987,
  "village_id": 1234,
  "ac_no": 42,
  "feedback": "Optional follow-up feedback"
}
```

When `has_problem` is false, `summary` may be omitted. When true, `summary` is
required. At least one of `sid`, `village_id`, or `ac_no` is required. Reports are
visible in state, district, assembly, and village scopes, newest first; the
dashboard reads up to 100 at a time. Retries with the same provider and call ID
update the existing call row. `occurred_at` is stored in the existing
`created_at` column. Do not send recordings or unrelated provider
payload fields through this endpoint.
