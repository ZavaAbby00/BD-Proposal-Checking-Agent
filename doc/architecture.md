# Architecture

The AI Proposal Checking Agent reviews a Business Development proposal draft against a
client brief / RFP / TOR and returns a structured, citation-grounded checking result. It is
built as **one framework-agnostic engine consumed by two delivery surfaces** — an MCP
server and a multi-tenant SaaS web app.

> All diagrams below are [Mermaid](https://mermaid.js.org/) and render directly on GitHub.

## System architecture

```mermaid
flowchart TB
    browser["BD team browser"]
    mcpclient["MCP clients<br/>IDE agents · desktop assistants · custom agents"]

    subgraph service["Cloud Run — single container"]
        direction TB
        web["Web app<br/>Next.js UI · API routes · admin panels"]
        mcp["MCP server<br/>tools · resources · prompts"]
        engine["Core engine — src/engine<br/>LangGraph orchestrator + 10 agents"]
        web --> engine
        mcp --> engine
    end

    subgraph shared["Shared infrastructure"]
        sql[("Cloud SQL<br/>PostgreSQL")]
        gcs[("Cloud Storage")]
        vertex["Vertex AI<br/>Gemini 3.5 Flash"]
        langfuse["Langfuse"]
    end

    browser -->|Google SSO| web
    mcpclient -->|organization API key| mcp
    web --> sql
    web --> gcs
    mcp --> sql
    engine --> vertex
    engine -.->|traces| langfuse
```

The **engine** has no HTTP or framework dependencies. The web app and the MCP server are
peer consumers of it — the same review capability is reachable from a browser or from any
AI agent. Everything ships in one container and runs as a single Cloud Run service.

## Components

| Component | Path | Responsibility |
|---|---|---|
| Engine | `src/engine/` | The multi-agent orchestrator + agents |
| MCP server | `src/mcp/` + `src/app/api/mcp/` | Exposes the engine as MCP tools/resources/prompts |
| Web app | `src/app/` | Next.js UI, API routes, admin & platform panels |
| Services | `src/lib/` | Auth, tenancy, storage, the review runner, document parsing |
| Data | `prisma/` | Schema, migrations, seed |

## The multi-agent pipeline

```mermaid
flowchart TB
    start(["runReview()"]) --> intake["Document Intake"]
    intake --> ra["Requirement Analyst"]
    intake --> sm["Section Mapper"]
    ra --> comp["Compliance"]
    sm --> compl["Completeness"]
    sm --> risk["Risk"]
    comp --> verify["Citation Verifier"]
    compl --> verify
    risk --> verify
    verify --> score["Scoring"]
    score --> rec["Recommendation"]
    rec --> asm["Report Assembler"]
    asm --> report(["ProposalReviewReport"])

    classDef llm fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    classDef det fill:#f1f5f9,stroke:#475569,color:#1e293b
    classDef tool fill:#fef3c7,stroke:#d97706,color:#713f12
    class ra,sm,compl,rec llm
    class intake,verify,score,asm det
    class comp,risk tool
```

A LangGraph `StateGraph` orchestrates ten agents. **Completeness, Compliance and Risk run
concurrently** (fan-out); the Citation Verifier joins them. Blue nodes are LLM agents, grey
nodes are deterministic, amber nodes are tool-using agents (they call the `search_proposal`
retrieval tool). Two deterministic agents make the result trustworthy: the **Citation
Verifier** downgrades any claim it cannot ground in the source, and the **Scoring** agent
hard-caps the verdict at `NOT_READY` when a mandatory section is missing. See
[engine.md](engine.md) for the full agent reference.

## Request flows

### Web review — asynchronous

```mermaid
sequenceDiagram
    actor User as BD reviewer
    participant Web as Web app
    participant Job as Background job
    participant Engine
    participant DB as PostgreSQL

    User->>Web: POST /api/reviews (documents)
    Web->>DB: create Document + Review (QUEUED)
    Web-->>User: reviewId
    Web-)Job: kick (fire-and-forget)
    Job->>Engine: runReview()
    Engine->>DB: write progress per agent
    Engine-->>Job: ProposalReviewReport
    Job->>DB: Review = SUCCEEDED + result
    loop poll every 2.5s
        User->>Web: GET /api/reviews/{id}/status
        Web-->>User: status + progress
    end
    User->>Web: open /reviews/{id} — render report
```

The upload returns immediately; the engine runs as a background job and streams per-agent
progress into the database, which the review page polls.

### MCP review — synchronous

```mermaid
sequenceDiagram
    participant Client as MCP client
    participant MCP as MCP server
    participant Engine
    participant DB as PostgreSQL

    Client->>MCP: review_proposal + Bearer API key
    MCP->>DB: verify key, resolve organization
    MCP->>Engine: runReview() — inline
    Engine-->>MCP: ProposalReviewReport
    MCP->>DB: persist Review (surface = MCP)
    MCP-->>Client: structured JSON result
```

Over MCP the engine runs inline — the tool call stays open until the report is ready.

## Multi-tenancy & access control

```mermaid
flowchart TB
    signin["Google sign-in"] --> verified{"email verified?"}
    verified -->|no| deny["Access denied"]
    verified -->|yes| super{"in SUPERADMIN_EMAILS?"}
    super -->|yes| sa["SUPER_ADMIN"]
    super -->|no| domain{"domain whitelisted?"}
    domain -->|yes| join["Joins organization"]
    domain -->|no| email{"email whitelisted?"}
    email -->|yes| join
    email -->|no| deny
    join --> grant{"admin grant?"}
    grant -->|yes| orgadmin["ORG_ADMIN"]
    grant -->|no| reviewer["REVIEWER"]

    classDef bad fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
    classDef good fill:#dcfce7,stroke:#16a34a,color:#14532d
    class deny bad
    class sa,orgadmin,reviewer good
```

Every business record carries an `organizationId`. Web sign-in is gated in the Auth.js
callbacks by this flow; the MCP surface authenticates with per-organization API keys
instead. Both paths resolve to exactly one organization, and all data access is scoped to
it.

## Data model

```mermaid
erDiagram
    Organization ||--o{ User : "has"
    Organization ||--o| OrgSettings : "configured by"
    Organization ||--o{ WhitelistedDomain : "allows"
    Organization ||--o{ WhitelistedEmail : "allows"
    Organization ||--o{ ApiKey : "issues"
    Organization ||--o{ Document : "owns"
    Organization ||--o{ Review : "owns"
    Organization ||--o{ AuditLog : "records"
    User ||--o{ Account : "links"
    User ||--o{ Review : "creates"
    User ||--o{ ApiKey : "creates"
    Document ||--o{ Review : "reviewed in"
    Review ||--o{ ReviewFeedback : "rated by"
```

PostgreSQL via Prisma (`prisma/schema.prisma`). `Review` holds the run status, per-agent
progress and the full structured `result` JSON. `OrgSettings` holds the per-organization
model config and review rubric. `Account` stores the Google OAuth tokens used to export
Google Docs. (`Session` / `VerificationToken` are Auth.js plumbing, omitted above.)

## Deployment topology

```mermaid
flowchart LR
    dev["Developer"] -->|git push| gh["GitHub repo"]
    gh -->|Cloud Build trigger| cb["Cloud Build"]
    cb -->|push image| ar["Artifact Registry"]
    cb -->|deploy| cr["Cloud Run<br/>proposal-agent"]
    ar -.->|image| cr
    cr -->|service account dev-zava| vertex["Vertex AI"]
    cr -->|Cloud SQL connector| sql[("Cloud SQL<br/>dev-zava")]
    cr --> gcs[("Cloud Storage<br/>elipedia")]
    cr -->|mounted| sm["Secret Manager"]
    cr -.->|traces| lf["Langfuse"]
```

A push to `main` triggers Cloud Build, which builds the image, pushes it to Artifact
Registry and deploys a new Cloud Run revision. The service runs as the `dev-zava` service
account; secrets are mounted from Secret Manager. See [deployment.md](deployment.md).

## Technology stack

TypeScript · Next.js 15 (App Router) · LangGraph.js · Vertex AI Gemini 3.5 Flash ·
`@modelcontextprotocol/sdk` + `mcp-handler` · Auth.js v5 · Prisma + PostgreSQL ·
Langfuse · Zod · Tailwind CSS + shadcn/ui · Docker → Cloud Run.

## Repository layout

```
src/engine/      orchestrator · agents/* (10) · schema (Zod) · tools · llm · langfuse
src/mcp/         server (tools/resources/prompts) · stdio entry · context (API-key auth)
src/app/         routes — (app)/* UI, admin/*, platform/*, api/* (reviews, auth, mcp)
src/lib/         auth, session, tenancy, storage, reviews runner, engine-config, docparse/*
src/components/  app shell, review UI, admin UI, ui/* primitives
prisma/          schema · migrations · seed
scripts/         review-sample · eval · deploy
samples/ · eval/ · doc/
```
