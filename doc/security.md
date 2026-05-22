# Security Review

| | |
|---|---|
| **Application** | AI Proposal Checking Agent |
| **Review date** | 22 May 2026 |
| **Scope** | Full application — engine, MCP server, web app, auth, infrastructure |
| **Method** | Code review of `src/`, the Prisma schema, deploy config, and dependency surface |

## Summary

The application's security posture is **solid for its stage**. Authentication,
multi-tenant isolation, secret management and injection resistance are designed in. This
review removed one over-broad OAuth scope and one unused dependency, and records the
remaining items as prioritized recommendations — none are Critical or High.

## Security model (controls in place)

- **Authentication** — Google SSO via Auth.js v5; JWT sessions. The multi-tenant gate in
  the `signIn` / `jwt` callbacks denies any email not matched to an organization.
- **Minimal OAuth scope** — only `openid email profile` is requested. The app has **no
  access to users' Google Drive or any other Google data** (see F-1).
- **Authorization** — three roles (`SUPER_ADMIN` / `ORG_ADMIN` / `REVIEWER`). Middleware
  gates routes; `src/lib/session.ts` re-reads the user from the database on every
  server request, so a disabled account loses access immediately. Admin server actions
  re-check the role before every mutation.
- **Multi-tenant isolation** — every business record carries `organizationId`; all
  queries are organization-scoped, and cross-organization access to reviews is rejected.
- **MCP API keys** — 256-bit random; only the SHA-256 hash is stored; scoped
  (`READ_ONLY` / `FULL`); revocable; sent as bearer tokens.
- **Secret management** — secrets live in Secret Manager (mounted at runtime), never in
  the repo. `.env` is git-ignored; the audit found no secret values committed. The Vertex
  SDK's `GOOGLE_API_KEY` foot-gun is scrubbed in `src/engine/llm.ts`.
- **Injection resistance** — Prisma parameterizes all SQL; React auto-escapes all output
  and no `dangerouslySetInnerHTML` is used, so LLM-generated text cannot inject markup.
- **LLM-manipulation resistance** — the verdict is computed by the deterministic Scoring
  agent and citations by the deterministic Citation Verifier, so prompt injection in a
  proposal cannot force a "READY" verdict or fabricate citations.
- **Transport & runtime** — HTTPS only (Cloud Run); the runtime service account holds
  scoped roles; audit logging records administrative and review actions.

## Findings

| # | Finding | Severity | Status |
|---|---|---|---|
| F-1 | OAuth requested `drive.readonly` (read all of a user's Drive) | Medium | **Resolved** |
| F-2 | No rate limiting on review creation | Medium | Open — recommendation |
| F-3 | Runtime service account has bucket-wide `storage.objectAdmin` | Low | Open — recommendation |
| F-4 | No Content-Security-Policy / hardening headers | Low | Open — recommendation |
| F-5 | Prompt injection via proposal content | Low | Mitigated by design |
| F-6 | Langfuse traces contain proposal text | Low | Open — configuration guidance |
| F-7 | Document parsing has no time bound | Low | Open — recommendation |
| F-8 | Dependency hygiene | Low | Partially resolved |
| F-9 | API error responses echo exception messages | Info | Accepted |

### F-1 · OAuth scope — RESOLVED

The Google provider previously requested `https://www.googleapis.com/auth/drive.readonly`
so the app could ingest Google Docs by link — which grants read access to **every file in
the user's Drive**. This review removed the scope: the app now requests only
`openid email profile`. Google Docs are still reviewable by exporting them to PDF/DOCX and
uploading. *Action for the operator:* remove `drive.readonly` from the OAuth consent
screen's configured scopes in the Google Cloud console.

### F-2 · Rate limiting — Medium

A review run triggers several Vertex AI calls. An authenticated user (web) or `FULL`-scope
API key (MCP `review_proposal`) could submit many reviews and amplify cost / exhaust
resources. **Recommendation:** per-organization and per-API-key rate limits, plus a cap on
concurrent in-flight reviews.

### F-3 · Storage IAM scope — Low

The runtime service account `dev-zava` holds `storage.objectAdmin` on the shared
`elipedia` bucket, which also stores unrelated workloads' data. **Recommendation:** use a
dedicated bucket for this app, or an IAM condition restricting access to the `org/` prefix.

### F-4 · Security headers — Low

The app does not set a Content-Security-Policy or other hardening headers.
**Recommendation:** add `Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy` and a frame-ancestors restriction via `next.config.ts` `headers()`.

### F-5 · Prompt injection — Low, mitigated

A malicious proposal could embed instructions aimed at the LLM agents. The deterministic
Scoring agent and Citation Verifier mean injection **cannot** force a favourable verdict or
fake citations; residual risk is limited to skewed narrative text (summaries, notes). The
LLM outputs are additionally Zod-validated. Residual risk accepted.

### F-6 · Langfuse trace content — Low

When tracing is enabled, traces include proposal text — client-confidential content leaves
to the configured Langfuse project. Tracing is organization-controlled (a settings toggle
and the org's own keys). **Recommendation:** access-control the Langfuse project, and keep
tracing off for tenants with strict confidentiality needs.

### F-7 · Parsing DoS — Low

A crafted DOCX/PDF could be slow to parse. The 20 MB upload cap bounds this.
**Recommendation:** add a parse timeout.

### F-8 · Dependency hygiene — Low, partially resolved

The unused `googleapis` dependency was removed in this review (it was only used by the
now-deleted Drive integration). **Recommendation:** run `npm audit` in CI and enable
Dependabot; a few transitive packages show deprecation warnings.

### F-9 · Error verbosity — Informational

API routes return the caught exception's message to the client. Current messages are
validation text (safe); for unexpected failures, prefer a generic message and log details
server-side.

## Notes (by design — not findings)

- **`--allow-unauthenticated` on Cloud Run** is intentional: ingress is open because the
  application performs its own authentication (SSO + API keys). It is not a misconfiguration.
- **Background-job durability** — with `min-instances=0`, a web review's background job can
  be cut short on scale-to-zero. This is an availability trade-off, not a security issue;
  `min-instances=1` or Cloud Tasks removes it.
- **Secret rotation** — establish a rotation policy for `AUTH_SECRET`, the database
  password and MCP API keys.

## Prioritized recommendations

1. Add per-organization / per-key rate limiting on review creation (F-2).
2. Move uploads to a dedicated GCS bucket or scope the IAM grant by prefix (F-3).
3. Add a Content-Security-Policy and hardening headers (F-4).
4. Add `npm audit` to CI; document the Langfuse data-processing posture (F-6, F-8).
5. Add a document-parsing timeout (F-7).
