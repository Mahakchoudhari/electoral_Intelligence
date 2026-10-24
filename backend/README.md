# Electoral Intelligence API

FastAPI serves the dashboard GraphQL API at `/graphql`. Configure
`DATABASE_URL` before starting the service:

```bash
cd backend
uv sync
uv run --env-file .env uvicorn app.main:app --reload --port 8000
```

State outlines remain file-backed from `INDIA/INDIA_STATES.geojson` (a CSV
with embedded GeoJSON geometry is also supported), configurable through
`GIS_STATES_FILE`. District, AC, and village boundaries are now read from
PostGIS.

## GIS data

The one-time import created `districts` and `village_boundaries`, linked ACs to
districts, and loaded 75 district, 403 AC, and 14,726 village boundary
features. Existing election and booth-result rows were preserved. Village
boundary features link to legacy `villages` rows only where the AC/name match
was unambiguous; all source geometries are retained in `village_boundaries`.

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
