# MCP Server

The proposal-review engine is exposed over the **Model Context Protocol** so any MCP
client (IDE agents, desktop AI assistants, custom agents) can drive it.

## Endpoint & transports

| Transport | How |
|---|---|
| Streamable HTTP | `POST https://<host>/api/mcp/mcp` — hosted in the Next.js app via `mcp-handler` |
| stdio | `MCP_API_KEY=<key> npm run mcp:stdio` — for local desktop clients |

Implementation: `src/mcp/server.ts` registers all tools/resources/prompts;
`src/app/api/mcp/[transport]/route.ts` is the HTTP route; `src/mcp/stdio.ts` is the
stdio entry.

## Authentication

Requests authenticate with a **per-organization API key** (created in **Admin → API
keys**), sent as a bearer token:

```
Authorization: Bearer pck_xxxxxxxxxxxx
```

Only the SHA-256 hash of the key is stored. Keys have a scope:

- **FULL** — every tool, including running reviews.
- **READ_ONLY** — only `get_review`, `list_reviews`, `search_proposal`.

The key resolves to an organization; all data access is scoped to it.

## Tools

| Tool | Input | Scope | Result |
|---|---|---|---|
| `review_proposal` | `proposalText`, `rfpText?`, `title?` | FULL | Runs the full multi-agent review, persists it, returns the structured report |
| `extract_requirements` | `rfpText` | FULL | Requirement Analyst agent only — discrete requirements |
| `map_sections` | `proposalText` | FULL | Section Mapper agent only — section map + summary |
| `check_completeness` | `proposalText` | FULL | Section Mapper → Completeness — the section checklist |
| `analyze_risks` | `proposalText` | FULL | Section Mapper → Risk — gaps + commercial risks |
| `search_proposal` | `proposalText`, `query`, `topK?` | any | Lexical retrieval over the proposal's passages |
| `get_review` | `reviewId` | any | Fetch a stored review's report |
| `list_reviews` | `limit?` | any | List recent reviews for the organization |

`review_proposal` runs the whole orchestrator; the granular per-agent tools let an
external agent compose the pipeline itself.

## Resources

| URI | Contents |
|---|---|
| `rubric://current` | The organization's active review rubric (sections, weights, thresholds) |
| `review://{reviewId}` | A stored review report addressed by id |

## Prompts

| Prompt | Purpose |
|---|---|
| `proposal-review` | A guided prompt that walks any LLM through the review methodology — for clients that want the approach without the tools |

## Connecting a client

**Remote (Streamable HTTP)** — point the client at `https://<host>/api/mcp/mcp` with the
`Authorization: Bearer <key>` header.

**Local (stdio)** — for example, an MCP client configuration entry:

```json
{
  "mcpServers": {
    "proposal-agent": {
      "command": "npm",
      "args": ["run", "mcp:stdio"],
      "env": { "MCP_API_KEY": "pck_xxxxxxxxxxxx" }
    }
  }
}
```

## Example

`review_proposal` returns two content blocks: a one-line summary and the full
`ProposalReviewReport` JSON (see [engine.md](engine.md#structured-output)). A review takes
roughly a minute — the HTTP request stays open until it completes.
