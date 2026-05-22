# AI Proposal Checking Agent — Design

This document answers the five assignment questions. The accompanying repository
is a working prototype: a multi-agent review **engine** exposed through two
delivery surfaces — an **MCP server** and a **multi-tenant SaaS web app**.

---

## 1. System Design

### Architecture — one engine, two surfaces

```
        ┌────────────────────────────────────────────────────────┐
        │  CORE ENGINE   src/engine  (framework-agnostic, no HTTP) │
        │  ┌──────────────────────────────────────────────────┐  │
        │  │ ORCHESTRATOR AGENT  (LangGraph StateGraph)        │  │
        │  │   coordinates 10 specialist agents                │  │
        │  └──────────────────────────────────────────────────┘  │
        │     Vertex AI · Gemini 3.5 Flash    ·   Langfuse traces  │
        └───────────────┬───────────────────────┬─────────────────┘
                        │                       │
          ┌─────────────▼──────────┐  ┌─────────▼──────────────────┐
          │ MCP SERVER             │  │ SaaS WEB APP                │
          │ /api/mcp/mcp           │  │ Next.js UI · Google SSO     │
          │ tools/resources/prompts│  │ · admin panels              │
          │ Streamable HTTP + stdio│  │                            │
          │ per-org API-key auth   │  │                            │
          └────────────────────────┘  └────────────────────────────┘
                  ▲                            ▲
            any MCP client                BD team browser

   shared: Postgres (Cloud SQL) · Cloud Storage · per-org settings & rubric
```

The **engine** (`src/engine/`) has zero HTTP/framework dependencies, so the MCP
server and the web app are *peer consumers* of the same code — the
proposal-checking capability is reusable by any AI agent, not locked to one UI.

### Technology choices

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One repo, one container, shared types across engine, MCP tool schemas and UI |
| Agent framework | LangGraph.js | Explicit multi-agent orchestration with parallel fan-out |
| LLM | Vertex AI Gemini 3.5 Flash | Fast, strong structured output; ADC auth (no API keys) |
| MCP | `@modelcontextprotocol/sdk` + `mcp-handler` | Streamable HTTP MCP server hosted inside a Next.js route |
| Web | Next.js 15 (App Router) | UI + API + server actions in one runtime |
| Auth | Auth.js v5 — Google SSO | Domain-restricted sign-in; no third-party data scopes requested |
| Observability | Langfuse | Traces the orchestrator → agent → tool tree |
| Data | PostgreSQL + Prisma | Multi-tenant relational data |
| Storage | Cloud Storage (local-disk fallback) | Uploaded documents |
| Deploy | Docker → Cloud Run | Single container, autoscaling |

### Document ingestion

`PDF` (via `unpdf`, per-page text) and `DOCX` (via `mammoth`) uploads are
normalized into a `ParsedDoc`: a list of **chunks**, each with a stable id
(`P3-002` = proposal, page 3, chunk 2). Chunk ids are the **citation anchors**
that make every finding traceable to the source.

### Multi-tenancy & access

Three roles — `SUPER_ADMIN` (platform), `ORG_ADMIN`, `REVIEWER`. Sign-in is
gated: an email is matched to an organization by (1) the `SUPERADMIN_EMAILS`
env break-glass list, (2) a whitelisted domain, or (3) a whitelisted email — no
match means no access. Every record carries `organizationId`. The MCP surface
authenticates with per-organization API keys instead of SSO.

---

## 2. Agentic Workflow

The engine is an **Orchestrator Agent** (a deterministic LangGraph `StateGraph`)
coordinating **ten specialist agents**. Deterministic routing is deliberate: the
review stages are fixed, so a deterministic orchestrator gives predictable cost,
latency and auditability (an LLM-supervisor variant is a documented future
option).

| # | Agent | Type | Responsibility |
|---|---|---|---|
| — | **Orchestrator** | LangGraph graph | Control flow, shared state, fan-out/fan-in, retries, tracing |
| 1 | Document Intake | deterministic | Validate parsed documents; raise warnings |
| 2 | Requirement Analyst | LLM | RFP/TOR → discrete, checkable requirements |
| 3 | Section Mapper | LLM | Map proposal content onto the canonical section taxonomy |
| 4 | Completeness | LLM | Each rubric section: present / partial / missing + quality |
| 5 | Compliance | LLM + `search_proposal` tool | Each requirement → covered / partial / missing |
| 6 | Risk | LLM + `search_proposal` tool | Gaps, unclear scope, weak value prop, commercial risks |
| 7 | Citation Verifier | deterministic | Drop invalid citations; **downgrade unverifiable claims** |
| 8 | Scoring | deterministic + rubric | Readiness score + verdict with **hard caps** |
| 9 | Recommendation | LLM | Prioritized improvement actions |
| 10 | Report Assembler | deterministic | Build + Zod-validate the final report |

**Flow** (agents 4/5/6 run concurrently — LangGraph fan-out):

```
intake → ┬─ requirement-analyst ─→ compliance ─┐
         └─ section-mapper ──┬──→ completeness ─┤
                             └──→ risk ─────────┤
                                                ▼
                                      citation-verifier
                                                ▼
                                            scoring
                                                ▼
                                         recommendation
                                                ▼
                                        report-assembler
```

**Two architectural guardrails** make the engine trustworthy:

- **Citation Verifier** — every finding cites chunk ids; ids that don't resolve
  to the source are dropped, and any "present"/"covered" claim left with **no
  citation is downgraded to "missing."** The engine never asserts something it
  cannot point to.
- **Scoring agent** — the verdict is *not* an LLM opinion. It is computed from
  the rubric, with hard rules: **any missing mandatory section, or any critical
  risk, caps the verdict at `NOT_READY`** regardless of the numeric score.

Each LLM agent uses Gemini structured output (Zod schema) so its result is
schema-valid by construction. Agent failures are caught — the pipeline degrades
gracefully and records a warning rather than aborting.

---

## 3. Structured Output

The engine returns one canonical JSON object (`ProposalReviewReport`, defined as
a Zod schema in `src/engine/schema.ts` and validated before it is persisted or
returned over MCP). Abridged real example:

```json
{
  "schemaVersion": "1.0",
  "meta": {
    "reviewId": "rev_8f3a",
    "proposalFile": "proposal-pt-sentosa.txt",
    "rfpFile": "tor-pt-sentosa.txt",
    "model": "gemini-3.5-flash",
    "reviewedAt": "2026-05-22T08:14:00Z",
    "langfuseTraceUrl": "https://cloud.langfuse.com/trace/...",
    "warnings": []
  },
  "proposalSummary": {
    "client": "PT Sentosa Abadi Finansial",
    "engagement": "Managed 24/7 SOC services, 12-month term",
    "overview": "Nimbus Secure proposes a fully managed Security Operations Center ...",
    "proposedValue": null
  },
  "completenessChecklist": [
    { "section": "Scope of Work", "mandatory": true, "status": "present",
      "quality": "strong", "note": "...", "citationIds": ["C3", "C4"] },
    { "section": "Pricing / Cost Breakdown", "mandatory": true, "status": "missing",
      "quality": null, "note": "No cost breakdown anywhere in the proposal.",
      "citationIds": [] },
    { "section": "Assumptions & Exclusions", "mandatory": true, "status": "missing",
      "quality": null, "note": "No assumptions section.", "citationIds": [] }
  ],
  "requirementMatch": {
    "rfpProvided": true,
    "summary": { "total": 18, "covered": 11, "partial": 4, "missing": 3 },
    "items": [
      { "requirementId": "R4", "requirement": "Quarterly penetration testing",
        "category": "Technical", "mandatory": true, "status": "missing",
        "note": "Not addressed anywhere in the proposal.", "citationIds": [] }
    ]
  },
  "keyGaps": [
    { "id": "G1", "type": "missing_section", "severity": "critical",
      "description": "Mandatory section \"Pricing / Cost Breakdown\" is missing.",
      "citationIds": [] }
  ],
  "commercialRisks": [
    { "id": "CR1", "category": "pricing", "severity": "critical",
      "description": "No price means the bid is non-responsive.", "citationIds": [] }
  ],
  "valueProposition": { "assessment": "weak", "note": "Generic differentiators ..." },
  "recommendations": [
    { "priority": 1, "action": "Add a complete itemised pricing schedule ...",
      "rationale": "...", "relatedTo": ["G1", "CR1"] }
  ],
  "readinessScore": {
    "score": 49,
    "verdict": "NOT_READY",
    "subScores": { "completeness": 62, "requirementCoverage": 75, "riskPenalty": 34 },
    "rationale": "Verdict hard-capped at NOT_READY — mandatory sections Pricing / Cost Breakdown and Assumptions & Exclusions are missing.",
    "blockingIssues": ["G1", "G2"]
  },
  "citations": [
    { "id": "C3", "docKind": "proposal", "page": 1, "section": "Scope of Work",
      "quote": "Nimbus Secure will provide round-the-clock monitoring ..." }
  ]
}
```

This covers every requested element: proposal summary, completeness checklist,
requirement match, key gaps, commercial risks, recommendation, readiness score,
and citations.

---

## 4. Evaluation — is the output accurate, grounded, and useful?

**Accuracy.** A golden dataset (`eval/dataset.json`) pairs sample proposals with
known-correct expectations. `npm run eval` runs the engine over it and checks:
verdict accuracy, that the expected mandatory sections are flagged missing, and
section/requirement classification. Metrics worth tracking over time:
section-extraction accuracy, and requirement-match precision/recall (against a
human-labelled key).

**Grounded.** Every finding must cite chunk ids that resolve to the source. The
Citation Verifier enforces this in the pipeline; the eval harness re-checks it
as a regression test — `unresolved citation references` must be zero. A deeper
check is *citation support*: an LLM-as-judge (plus human spot-checks) confirms
the quote actually backs the claim.

**The critical metric — false-READY rate.** A proposal missing a mandatory
section must *never* be `READY`. The eval asserts this on every case; it must
stay at 0. This is the failure mode from §5.

**Useful for BD review.** Reviewers rate each review (the `ReviewFeedback`
model captures thumbs up/down + an optional correction). Corrections feed back
into the golden dataset, so the eval set grows from real usage.

**Observability.** Every run is traced in Langfuse — per-agent latency, token
cost, inputs/outputs — so prompt regressions are caught when the eval is run
after any prompt change.

---

## 5. Debugging Scenario

> *The AI says the proposal is ready to submit, but the proposal does not
> include pricing and assumptions.*

This is a grounding/validation failure. What to check, in order:

1. **Rubric** — are "Pricing" and "Assumptions" in the organization's
   *mandatory* sections list (`Admin → AI & rubric`)? The Completeness agent
   only checks sections the rubric names. If they're missing from the list,
   add them.
2. **Section Mapper trace** — open the Langfuse trace for the `section-mapper`
   node. Did it mislabel another section as pricing, or miss a pricing table
   that lives in an appendix?
3. **Scoring hard cap** — did the deterministic cap fire? If the verdict came
   out `READY`, either a mandatory section was wrongly marked *present*, or the
   cap was bypassed. The cap runs *after* the Citation Verifier on purpose.
4. **Citation check** — did the Completeness agent claim "pricing present" and
   cite a chunk? Open that chunk — does it actually contain pricing? If it
   cited nothing, the Citation Verifier should already have downgraded it to
   missing.
5. **Parsing** — was the pricing in a scanned image/table that text extraction
   missed? Then the document genuinely has no pricing *text*; the fix is OCR.

**Why this implementation makes the bug almost impossible.** The verdict is not
the LLM's to give. Two deterministic guardrails stand between the agents and
the verdict:

- The **Citation Verifier** downgrades any "present" claim with no resolvable
  citation to "missing" — an LLM cannot bluff a section into existence.
- The **Scoring agent** hard-caps the verdict at `NOT_READY` whenever any
  mandatory section is missing (a missing mandatory section also becomes a
  deterministic *critical gap*). A score of 90/100 still yields `NOT_READY`.

So a true "pricing missing" → completeness `missing` → critical gap →
`blockingIssues` non-empty → verdict `NOT_READY`. The scenario is also a
permanent regression case in `eval/dataset.json`
(`missing-pricing-and-assumptions`). The remaining real-world failure path is
*parsing* (a scanned pricing page) — handled by the §4 grounding checks and an
OCR fallback.

**Fix summary:** ensure Pricing & Assumptions are mandatory in the rubric;
keep the Scorer's hard cap downstream of the Citation Verifier; add the case to
the eval set; add an OCR fallback for image-only documents.
