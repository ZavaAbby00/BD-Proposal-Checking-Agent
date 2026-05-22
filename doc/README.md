# Technical Documentation

Reference documentation for the **AI Proposal Checking Agent**.

For the high-level design rationale and the assignment answers, see
[`../DESIGN.md`](../DESIGN.md). For setup and usage, see [`../README.md`](../README.md).

| Document | Contents |
|---|---|
| [architecture.md](architecture.md) | System architecture, components, request flows, multi-tenancy, data model |
| [engine.md](engine.md) | The multi-agent review engine — orchestrator, the ten agents, scoring, guardrails |
| [mcp.md](mcp.md) | MCP server — tools, resources, prompts, authentication, connecting clients |
| [api.md](api.md) | HTTP API reference — routes and request/response shapes |
| [deployment.md](deployment.md) | Deployment, environment variables, CI/CD, operations |

## At a glance

- **One engine, two surfaces.** A framework-agnostic multi-agent engine (`src/engine/`)
  is consumed by an MCP server (`src/mcp/`) and a multi-tenant Next.js SaaS web app.
- **Multi-agent.** A LangGraph orchestrator coordinates ten specialist agents on
  Vertex AI Gemini, traced in Langfuse.
- **Trustworthy by construction.** A deterministic Citation Verifier and a deterministic
  Scoring agent mean the verdict is never an unchecked LLM opinion.
- **Live:** https://proposal-agent-73183888096.asia-southeast2.run.app
