# HTTP API

The web app's route handlers live under `src/app/api/`. Application routes use the
Auth.js **session cookie**; the MCP route uses an API key (see [mcp.md](mcp.md)).

## `POST /api/reviews`

Create and start a review. Auth: session (REVIEWER+). Body: `multipart/form-data`.

| Field | Values |
|---|---|
| `proposalSource` | `upload` or `gdoc` |
| `proposalFile` | the file (when `proposalSource=upload`) — PDF / DOCX / TXT / MD, ≤ 20 MB |
| `proposalGdocUrl` | a Google Docs link (when `proposalSource=gdoc`) |
| `rfpSource` | `none`, `upload` or `gdoc` |
| `rfpFile` / `rfpGdocUrl` | as above, when an RFP is supplied |
| `title` | optional review title |

Stores the documents, creates `Document` + `Review` rows, kicks the background job, and
returns immediately:

```json
{ "id": "rev_..." }          // 200
{ "error": "message" }       // 400 / 401 / 403
```

Google Docs are exported via the Drive API using the signed-in user's OAuth token
(the `drive.readonly` scope is requested at sign-in).

## `GET /api/reviews/{id}/status`

Lightweight status, polled by the review page. Auth: session.

```json
{
  "status": "QUEUED | RUNNING | SUCCEEDED | FAILED",
  "progress": { "completed": ["intake", "section-mapper", ...], "total": 10 },
  "verdict": "READY | NEEDS_REVISION | NOT_READY | null",
  "readinessScore": 49,
  "error": null
}
```

## `GET /api/reviews/{id}/result`

Returns the full `ProposalReviewReport` JSON as a downloadable attachment. Auth: session.
`409` if the review has no result yet.

## `GET|POST /api/auth/[...nextauth]`

Auth.js v5 endpoints — Google SSO sign-in, callback, sign-out, session. The `signIn` and
`jwt` callbacks enforce the multi-tenant gate (see [architecture.md](architecture.md#multi-tenancy)).

## `GET|POST|DELETE /api/mcp/[transport]`

The MCP server (Streamable HTTP). Authenticated by a per-organization API key.
See [mcp.md](mcp.md).

## Authorization summary

| Surface | Mechanism | Enforced in |
|---|---|---|
| Web pages | Auth.js session JWT | `middleware.ts` (coarse) + `src/lib/session.ts` (fresh role/disabled check) |
| App API routes | Auth.js session | `getDbUser()` per route |
| MCP route | Per-org API key (bearer) | `verifyMcpToken()` in `src/mcp/context.ts` |

Server actions for admin operations (`src/lib/admin-actions.ts`) re-check the caller's role
with `requireOrgAdmin()` / `requireSuperAdmin()` before every mutation.
