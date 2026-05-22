# Architecture

## Overview

The AI Proposal Checking Agent reviews a Business Development proposal draft against a
client brief / RFP / TOR and returns a structured, citation-grounded checking result.

It is built as **one engine consumed by two delivery surfaces**:

```
        ┌────────────────────────────────────────────────────────┐
        │  CORE ENGINE   src/engine  (framework-agnostic, no HTTP) │
        │  Orchestrator (LangGraph) + 10 specialist agents         │
        │  Vertex AI Gemini 3.5 Flash   ·   Langfuse tracing       │
        └───────────────┬───────────────────────┬─────────────────┘
                        │                       │
          ┌─────────────▼──────────┐  ┌─────────▼──────────────────┐
          │ MCP SERVER  src/mcp    │  │ SaaS WEB APP  src/app       │
          │ /api/mcp/mcp           │  │ Next.js UI · Google SSO     │
          │ Streamable HTTP + stdio│  │ · admin + platform panels   │
          │ per-org API-key auth   │  │                            │
          └────────────────────────┘  └────────────────────────────┘
                  ▲                            ▲
            any MCP client                BD team browser

   shared: Postgres (Cloud SQL) · Cloud Storage · per-org settings & rubric
```

The engine (`src/engine/`) has **no HTTP or framework dependencies**. The MCP server and
the web app are peer consumers of it — the proposal-checking capability is reusable by any
AI agent, not locked to one UI.

## Components

| Component | Path | Responsibility |
|---|---|---|
| Engine | `src/engine/` | The multi-agent orchestrator + agents — see [engine.md](engine.md) |
| MCP server | `src/mcp/` + `src/app/api/mcp/` | Exposes the engine as MCP tools — see [mcp.md](mcp.md) |
| Web app | `src/app/` | Next.js UI, API routes, admin & platform panels |
| Services | `src/lib/` | Auth, tenancy, storage, the review runner, document parsing |
| Data | `prisma/` | Schema, migrations, seed |

## Request flows

### Web review (asynchronous)

1. `POST /api/reviews` — the upload handler stores the documents (GCS or local disk),
   creates `Document` + `Review` rows, and kicks a background job. It returns immediately.
2. `processReview()` (`src/lib/reviews.ts`) parses the documents, builds the engine config
   from the organization's settings, and runs the engine — writing per-agent progress to
   the `Review.progress` column.
3. The review page polls `GET /api/reviews/{id}/status`; when the status is `SUCCEEDED`
   it renders the structured report.

### MCP review (synchronous)

An MCP client calls the `review_proposal` tool with the proposal (and optional RFP) text.
The tool runs the engine inline and returns the structured JSON in the tool response.

## Multi-tenancy

Every business record carries an `organizationId`. Three roles:

| Role | Scope |
|---|---|
| `SUPER_ADMIN` | Platform — creates and suspends organizations |
| `ORG_ADMIN` | One organization — access control, API keys, AI & rubric settings |
| `REVIEWER` | One organization — runs and reads reviews |

Web sign-in is gated in the Auth.js `signIn` / `jwt` callbacks: an email is matched to an
organization via the `SUPERADMIN_EMAILS` env list, a whitelisted domain, or a whitelisted
email — no match means no access. The MCP surface authenticates with per-organization
API keys instead of SSO. Both resolve to an organization.

## Data model

PostgreSQL via Prisma (`prisma/schema.prisma`):

| Model | Purpose |
|---|---|
| `Organization` | A tenant |
| `User`, `Account`, `Session`, `VerificationToken` | Auth.js identity + Google OAuth tokens |
| `WhitelistedDomain`, `WhitelistedEmail` | Per-org sign-in access control |
| `ApiKey` | Per-org MCP API keys (SHA-256 hash stored) |
| `OrgSettings` | Per-org model config + review rubric (JSON) |
| `Document` | An uploaded proposal or RFP (metadata + storage key) |
| `Review` | One review run — status, progress, the structured `result` JSON, verdict |
| `ReviewFeedback` | Reviewer thumbs up/down + corrections (feeds evaluation) |
| `AuditLog` | Every administrative and review action |

## Tech stack

TypeScript · Next.js 15 (App Router) · LangGraph.js · Vertex AI Gemini 3.5 Flash ·
`@modelcontextprotocol/sdk` + `mcp-handler` · Auth.js v5 · Prisma + PostgreSQL ·
Langfuse · Zod · Tailwind CSS + shadcn/ui · Docker → Cloud Run.

## Repository layout

```
src/engine/      orchestrator · agents/* (10) · schema (Zod) · tools/search-proposal · llm · langfuse
src/mcp/         server (tools/resources/prompts) · stdio entry · context (API-key auth)
src/app/         routes — (app)/* UI, admin/*, platform/*, api/* (reviews, auth, mcp)
src/lib/         auth, session, tenancy, storage, reviews runner, engine-config, docparse/*
src/components/  app shell, review UI, admin UI, ui/* primitives
prisma/          schema · migrations · seed
scripts/         review-sample · eval · deploy
samples/ · eval/ · doc/
```
