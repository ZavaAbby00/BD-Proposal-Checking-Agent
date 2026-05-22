# AI Proposal Checking Agent

A multi-agent system that reviews a Business Development proposal draft against a
client brief / RFP / TOR and produces a structured, citation-grounded checking
result: completeness checklist, requirement match, gaps, commercial risks,
recommendations, and a readiness score.

The proposal-review **engine** is exposed through two surfaces:

- an **MCP server** — so any MCP-compatible client or AI agent can run reviews;
- a **multi-tenant SaaS web app** — Google SSO, an admin panel, and a UI for the
  BD team.

**Live demo:** https://proposal-agent-73183888096.asia-southeast2.run.app

> **Note —** the hosted demo is available until **29 May 2026**; after that date the
> Cloud Run service is shut down. Deploy your own instance from this repo (see below).

**Documentation**

- **[DESIGN.md](./DESIGN.md)** — design rationale and the assignment answers
  (System Design, Agentic Workflow, Structured Output, Evaluation, Debugging Scenario).
- **[doc/](./doc/)** — technical reference: [architecture](./doc/architecture.md) ·
  [engine](./doc/engine.md) · [MCP](./doc/mcp.md) · [HTTP API](./doc/api.md) ·
  [deployment](./doc/deployment.md).

## How it works

An **Orchestrator** (LangGraph) coordinates ten specialist agents — Document
Intake, Requirement Analyst, Section Mapper, Completeness, Compliance, Risk,
Citation Verifier, Scoring, Recommendation, Report Assembler — on Vertex AI
Gemini, fully traced in Langfuse. Two deterministic guardrails make the result
trustworthy: the **Citation Verifier** downgrades any claim it cannot ground in
the source document, and the **Scoring agent** hard-caps the verdict at
`NOT_READY` whenever a mandatory section (e.g. pricing) is missing.

## Tech stack

TypeScript · Next.js 15 · LangGraph.js · Vertex AI Gemini 3.5 Flash ·
`@modelcontextprotocol/sdk` + `mcp-handler` · Auth.js v5 (Google SSO) ·
Prisma + PostgreSQL · Langfuse · Docker → Cloud Run.

## Prerequisites

- Node.js 22+
- PostgreSQL (local, or via the bundled `docker-compose.yml`)
- A GCP project with the **Vertex AI API** enabled, and Application Default
  Credentials (`gcloud auth application-default login`)
- A Google OAuth 2.0 **Web** client for SSO — set the consent screen to
  *Internal* and add the redirect URI `<app-url>/api/auth/callback/google`
  (only the basic `openid email profile` scopes are requested)
- *(optional)* a Langfuse project for tracing

## Local setup

```bash
npm install
cp .env.example .env          # then fill in the values

# Database (option A: docker-compose)
docker compose up -d db
# ...or point DATABASE_URL at any local Postgres

npm run prisma:deploy         # apply migrations
npm run db:seed               # create the demo "Elitery" organization

npm run dev                   # http://localhost:3000
```

Set `SUPERADMIN_EMAILS` in `.env` to your Google email — you will sign in as a
platform super-admin. The seed whitelists the `elitery.com` domain; adjust it in
**Admin → Access control** or reseed for your own domain.

### Run the engine headless (no web app, no database)

```bash
npm run review:sample
# → runs the multi-agent engine on samples/ and writes samples/last-review.json
```

### Run the evaluation harness

```bash
npm run eval
# → runs eval/dataset.json: checks verdict accuracy, citation groundedness,
#   and the critical "false READY" guardrail
```

Both require Vertex AI access (ADC).

## Testing the full flow (the assignment's expected output)

1. Sign in with a whitelisted Google account.
2. **New review** → upload `samples/proposal-pt-sentosa.pdf` as the proposal and
   `samples/tor-pt-sentosa.pdf` as the client brief. (`.txt` and `.docx` files
   also work.)
3. Watch the multi-agent pipeline run, then read the structured result —
   completeness checklist, requirement match, key gaps, commercial risks,
   recommendations, readiness score, and citations.
4. **Download JSON** for the raw structured output.

The sample proposal deliberately omits Pricing and Assumptions, so the verdict
is correctly **`NOT_READY`** — demonstrating the scoring hard cap.

## Using the MCP server

The engine is exposed as MCP tools (`review_proposal`, `extract_requirements`,
`map_sections`, `check_completeness`, `analyze_risks`, `search_proposal`,
`get_review`, `list_reviews`), resources, and a prompt.

1. In **Admin → API keys**, create an organization API key.
2. **Remote (Streamable HTTP):** point any MCP client at
   `<app-url>/api/mcp/mcp` with header `Authorization: Bearer <key>`.
3. **Local (stdio):** `MCP_API_KEY=<key> npm run mcp:stdio`.

## Admin panel

- **Access control** — whitelisted domains, whitelisted emails, user roles
- **API keys** — create / revoke MCP keys
- **AI & rubric** — Gemini model, mandatory & recommended sections, score
  weights, verdict thresholds
- **Audit log** — every administrative and review action
- **Platform** (super-admin) — create and suspend organizations

## Deploy to Cloud Run

Already running at the live URL above. To deploy your own instance:

```bash
gcloud builds submit --config=cloudbuild.yaml .   # or: bash scripts/deploy.sh
```

Full instructions — GCP setup, environment variables, secrets and CI/CD — are in
**[doc/deployment.md](./doc/deployment.md)**. The container runs `prisma migrate deploy`
on start; on Cloud Run, Vertex AI uses the runtime service account (no key file needed).

## Project structure

```
src/engine/      multi-agent core — orchestrator, 10 agents, schema, tools
src/mcp/         MCP server (tools/resources/prompts) + stdio entry
src/app/         Next.js routes — UI, API, MCP endpoint, admin, platform
src/lib/         auth, tenancy, storage, reviews service, document parsing
prisma/          schema + migrations + seed
scripts/         review-sample · eval · deploy
samples/         sample proposal + TOR (PDF + text, incl. the missing-pricing case)
eval/            evaluation dataset
doc/             technical documentation
Dockerfile       container build (entrypoint in docker/entrypoint.sh)
```

## npm scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the web app |
| `npm run build` | Production build |
| `npm run review:sample` | Run the engine headlessly on the samples |
| `npm run eval` | Run the evaluation harness |
| `npm run mcp:stdio` | Start the local stdio MCP server |
| `npm run prisma:deploy` | Apply database migrations |
| `npm run db:seed` | Seed the demo organization |
| `npm run typecheck` | Type-check the project |
