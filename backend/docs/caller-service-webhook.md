# Calling Service Webhook Integration

This document defines the payload the calling service should POST to Electoral
Intelligence when a call record is ready. Map the calling service's fields to
this contract. Send one JSON object per request.

## Request

- **Method:** `POST`
- **Path:** `/webhooks/calls`
- **URL:** `https://<electoral-intelligence-api-host>/webhooks/calls`
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer <shared-secret>`

The API team will provide the production host and shared secret through the
configured deployment channel. Keep the secret private and do not include it
in request bodies or logs.

## Payload

```json
{
  "provider": "calling-service-name",
  "call_id": "unique-call-id-from-provider",
  "occurred_at": "2026-10-29T10:30:00Z",
  "has_problem": true,
  "summary": "Street lights are not working",
  "category": "civic_issue",
  "sid": 987,
  "village_id": 1234,
  "ac_no": 42,
  "feedback": "Follow-up requested"
}
```

### Field mapping

| Field | Required | Description |
| --- | --- | --- |
| `provider` | Yes | Stable name for the calling service. |
| `call_id` | Yes | Stable call identifier, unique within `provider`; retries use the same value. |
| `occurred_at` | Yes | Call timestamp in ISO 8601 format, preferably with a UTC offset such as `Z`. |
| `has_problem` | Yes | Boolean from the caller's substantive/problem flag. Only `true` reports show in the area issues panel. |
| `summary` | When `has_problem` is true | Short issue summary. Optional when the flag is false. |
| `category` | No | Issue category. |
| `sid` | One area identifier required | Existing `sampark_sutra.sid`. The API resolves its village and assembly when available. |
| `village_id` | One area identifier required | Existing `villages.village_id`; preferred when the call is assigned directly to a village. |
| `ac_no` | One area identifier required | Existing assembly constituency number for assembly-only attribution. |
| `feedback` | No | Follow-up feedback to retain with the call. |

Provide at least one of `sid`, `village_id`, or `ac_no`. If multiple area IDs
are supplied, they must refer to the same area. A supplied `village_id` takes
precedence for village filtering; the API derives its assembly number from the
database. When `sid` is supplied, the API uses its `sampark_sutra` village and
assembly mapping where available.

For a call that did not raise a substantive issue, send `has_problem: false`;
`summary` may be omitted. Such a call is stored but excluded from the dashboard.

## Success and retries

A successful request returns HTTP `200`:

```json
{"status":"accepted","report_id":12345}
```

The report is stored in the production `call` table. The `has_problem` value is
stored in `call.flag`, and `occurred_at` is stored in `call.created_at`. The
dashboard shows true-flagged reports newest first at state, district, assembly,
and village scopes.

If delivery is retried, reuse the same `provider` and `call_id`. The API updates
the existing row instead of creating a duplicate.

### Production dry run

To verify the real bearer secret and area mapping without writing a call row,
send the same payload to:

```text
POST https://<electoral-intelligence-api-host>/webhooks/calls?dry_run=true
```

A successful dry run returns HTTP `200` with `"status":"validated"` and the
resolved area. It checks the payload and reads the referenced `sid`, village,
and assembly as applicable, but performs no insert or update. Omit the query
parameter for normal call delivery.

## Errors

| HTTP status | Meaning |
| --- | --- |
| `401` | Missing or invalid bearer secret. |
| `422` | Invalid payload, unknown area ID, conflicting area IDs, or missing summary for a substantive call. |
| `503` | Webhook secret or database is not configured on the API. |

Do not send call recordings or unrelated personal data in this webhook. Send
only the fields listed above.
