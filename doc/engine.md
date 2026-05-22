# The Multi-Agent Engine

The engine (`src/engine/`) is a LangGraph **orchestrator** coordinating ten specialist
**agents**. It is framework-agnostic — both delivery surfaces call `runReview()` from
`src/engine/index.ts`.

## Orchestrator

`src/engine/orchestrator.ts` defines a LangGraph `StateGraph`. Routing is **deterministic**
— the review stages are fixed, so a deterministic orchestrator gives predictable cost,
latency and auditability.

```
intake ─┬─▶ requirement-analyst ─▶ compliance ──┐
        └─▶ section-mapper ──┬──▶ completeness ──┤
                             └──▶ risk ──────────┤
                                                 ▼
                                       citation-verifier
                                                 ▼
                                             scoring
                                                 ▼
                                          recommendation
                                                 ▼
                                        report-assembler
```

`completeness`, `compliance` and `risk` run **concurrently** (LangGraph fan-out);
`citation-verifier` joins them. The run is streamed so per-agent progress can be reported
to the UI, and traced to Langfuse (one trace per review, one observation per agent).

## The ten agents

| # | Agent | Type | Responsibility |
|---|---|---|---|
| 1 | Document Intake | deterministic | Validate the parsed documents; raise warnings |
| 2 | Requirement Analyst | LLM | RFP/TOR → discrete, checkable requirements |
| 3 | Section Mapper | LLM | Map proposal content onto the canonical section taxonomy + summary |
| 4 | Completeness | LLM | Each rubric section → present / partial / missing + quality |
| 5 | Compliance | LLM + `search_proposal` | Each requirement → covered / partial / missing |
| 6 | Risk | LLM + `search_proposal` | Gaps, unclear scope, weak value proposition, commercial risks |
| 7 | Citation Verifier | deterministic | Drop invalid citations; **downgrade unverifiable claims** |
| 8 | Scoring | deterministic + rubric | Readiness score + verdict with **hard caps** |
| 9 | Recommendation | LLM | Prioritized improvement actions |
| 10 | Report Assembler | deterministic | Build + Zod-validate the final report |

Each LLM agent (`src/engine/agents/*.ts`) uses Gemini structured output bound to a Zod
schema, so its result is schema-valid by construction. The Compliance and Risk agents use
the `search_proposal` retrieval tool (`src/engine/tools/search-proposal.ts`) to gather
candidate evidence before reasoning.

## Shared state

The orchestrator threads a `ReviewState` between agents: the parsed `proposal` and `rfp`,
the `config`, and each agent's output (`requirements`, `sections`, `completenessRaw`,
`complianceRaw`, `riskRaw`, `verified`, `score`, `recommendations`, `report`). `warnings`
accumulates across agents via a reducer channel.

If an LLM agent throws, its node catches the error, records a warning, and returns a safe
empty default — the pipeline degrades gracefully rather than aborting.

## Structured output

`runReview()` returns a `ProposalReviewReport` (`src/engine/schema.ts`), validated against
its Zod schema before it is persisted or returned. Top-level fields:

| Field | Contents |
|---|---|
| `meta` | review id, file names, model, timestamp, Langfuse trace URL, warnings |
| `proposalSummary` | client, engagement, overview, proposed value |
| `completenessChecklist[]` | section · mandatory · status · quality · note · citationIds |
| `requirementMatch` | rfpProvided · summary counts · items[] (covered/partial/missing) |
| `keyGaps[]` | id · type · severity · description · citationIds |
| `commercialRisks[]` | id · category · severity · description · citationIds |
| `valueProposition` | assessment · note |
| `recommendations[]` | priority · action · rationale · relatedTo |
| `readinessScore` | score (0-100) · verdict · subScores · rationale · blockingIssues |
| `citations[]` | id · docKind · page · section · quote |

## Scoring and the hard rules

The **Scoring agent is deterministic** — the verdict is computed from the rubric, never
decided by an LLM.

```
completeness   = 100 · (0.8·avg(mandatory) + 0.2·avg(recommended))   present=1 partial=0.5 missing=0
coverage       = 100 · avg(requirements)                             covered=1 partial=0.5 missing=0
riskPenalty    = Σ severityWeight   (low 2, medium 5, high 10, critical 20; capped at 100)
score          = weighted blend of completeness, coverage and (100 − riskPenalty)
```

Two **hard caps** make a false "ready" structurally impossible:

1. Any **missing mandatory section** ⇒ a deterministic critical gap ⇒ verdict `NOT_READY`.
2. Any **critical-severity** gap or risk ⇒ verdict `NOT_READY`.

Otherwise the verdict is `READY` / `NEEDS_REVISION` / `NOT_READY` by the rubric's score
thresholds. Weights, thresholds and the mandatory-section list are per-organization and
editable in the admin panel.

## Citation grounding

Every finding cites chunk ids from the source documents. The **Citation Verifier**
(deterministic) drops ids that don't resolve, and **downgrades any `present` / `covered`
claim left with no surviving citation to `missing`** — the engine never asserts something
it cannot point to in the source. Surviving citations are renumbered `C1, C2, …` and
resolved to `{ page, section, quote }`.

## Running the engine headlessly

```bash
npm run review:sample        # runs the engine on samples/, writes samples/last-review.json
npm run eval                 # runs eval/dataset.json and checks verdict + groundedness
```

Both require Vertex AI access (Application Default Credentials).
