import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { buildEngineConfig } from "@/lib/engine-config";
import { parseDocument } from "@/lib/docparse";
import {
  runRequirementAnalyst,
  runSectionMapper,
  runCompleteness,
  runRisk,
} from "@/engine";
import { searchProposal } from "@/engine/tools/search-proposal";
import { processReview } from "@/lib/reviews";
import { putObject, objectKey } from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import type { DocKind } from "@/engine/types";
import type { OrgContext } from "@/mcp/context";

type GetOrg = (extra: unknown) => OrgContext;
type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function text(value: string): ToolResult {
  return { content: [{ type: "text", text: value }] };
}
function json(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
function failure(message: string): ToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}
function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function parseText(content: string, kind: DocKind) {
  return parseDocument({
    buffer: Buffer.from(content, "utf-8"),
    mimeType: "text/plain",
    filename: `${kind}.txt`,
    kind,
  });
}

/**
 * Register every MCP tool, resource and prompt onto a server. Shared by the
 * Streamable HTTP route and the stdio entry — `getOrg` resolves the calling
 * organization (from the bearer token over HTTP, from env over stdio).
 */
export function registerMcpServer(server: McpServer, getOrg: GetOrg): void {
  // ─────────────── Tool: full multi-agent review ───────────────
  server.registerTool(
    "review_proposal",
    {
      title: "Review a proposal",
      description:
        "Run the full multi-agent proposal review: completeness checklist, RFP " +
        "requirement matching, gaps, commercial risks, recommendations, a " +
        "readiness score and document-grounded citations. Returns a structured " +
        "JSON report. Requires a full-scope API key.",
      inputSchema: {
        proposalText: z.string().min(1).describe("Full text of the proposal draft"),
        rfpText: z
          .string()
          .optional()
          .describe("Client brief / RFP / TOR text — enables requirement matching"),
        title: z.string().optional().describe("A label for this review"),
      },
    },
    async (args, extra): Promise<ToolResult> => {
      try {
        const org = getOrg(extra);
        if (org.scope !== "FULL") {
          return failure("This API key is read-only; review_proposal needs full scope.");
        }
        const batch = nanoid(10);

        const proposalKey = objectKey(org.organizationId, batch, "proposal.txt");
        await putObject(proposalKey, Buffer.from(args.proposalText, "utf-8"), "text/plain");
        const proposalDoc = await prisma.document.create({
          data: {
            organizationId: org.organizationId,
            type: "PROPOSAL",
            filename: "mcp-proposal.txt",
            mimeType: "text/plain",
            storageKey: proposalKey,
            source: "UPLOAD",
          },
        });

        let rfpDocId: string | undefined;
        if (args.rfpText) {
          const rfpKey = objectKey(org.organizationId, batch, "rfp.txt");
          await putObject(rfpKey, Buffer.from(args.rfpText, "utf-8"), "text/plain");
          const rfpDoc = await prisma.document.create({
            data: {
              organizationId: org.organizationId,
              type: "RFP",
              filename: "mcp-rfp.txt",
              mimeType: "text/plain",
              storageKey: rfpKey,
              source: "UPLOAD",
            },
          });
          rfpDocId = rfpDoc.id;
        }

        const review = await prisma.review.create({
          data: {
            organizationId: org.organizationId,
            proposalDocId: proposalDoc.id,
            rfpDocId,
            title: args.title ?? "MCP review",
            status: "QUEUED",
            surface: "MCP",
          },
        });
        await logAudit({
          organizationId: org.organizationId,
          action: "review.create",
          target: review.id,
          metadata: { surface: "MCP" },
        });

        await processReview(review.id);
        const done = await prisma.review.findUnique({ where: { id: review.id } });
        if (!done || done.status !== "SUCCEEDED" || !done.result) {
          return failure(done?.error ?? "The review pipeline did not complete.");
        }

        const summary =
          `Review ${review.id} complete — verdict ${done.verdict}, ` +
          `readiness ${done.readinessScore}/100. Structured report follows as JSON.`;
        return {
          content: [
            { type: "text", text: summary },
            { type: "text", text: JSON.stringify(done.result, null, 2) },
          ],
        };
      } catch (e) {
        return failure(errMessage(e));
      }
    },
  );

  // ─────────────── Granular agent tools (bring-your-own-orchestrator) ───────────────
  server.registerTool(
    "extract_requirements",
    {
      title: "Requirement Analyst agent",
      description:
        "Run only the Requirement Analyst agent: extract discrete, checkable " +
        "requirements from an RFP/TOR. Returns a structured requirement list.",
      inputSchema: { rfpText: z.string().min(1).describe("RFP / TOR text") },
    },
    async (args, extra): Promise<ToolResult> => {
      try {
        const org = getOrg(extra);
        if (org.scope !== "FULL") return failure("This API key is read-only.");
        const config = await buildEngineConfig(org.organizationId);
        const rfp = await parseText(args.rfpText, "rfp");
        return json(await runRequirementAnalyst(rfp, config));
      } catch (e) {
        return failure(errMessage(e));
      }
    },
  );

  server.registerTool(
    "map_sections",
    {
      title: "Section Mapper agent",
      description:
        "Run only the Section Mapper agent: map a proposal onto the canonical " +
        "section taxonomy and summarize it.",
      inputSchema: { proposalText: z.string().min(1).describe("Proposal text") },
    },
    async (args, extra): Promise<ToolResult> => {
      try {
        const org = getOrg(extra);
        if (org.scope !== "FULL") return failure("This API key is read-only.");
        const config = await buildEngineConfig(org.organizationId);
        const proposal = await parseText(args.proposalText, "proposal");
        return json(await runSectionMapper(proposal, config));
      } catch (e) {
        return failure(errMessage(e));
      }
    },
  );

  server.registerTool(
    "check_completeness",
    {
      title: "Completeness agent",
      description:
        "Run the Section Mapper then the Completeness agent: assess every rubric " +
        "section as present / partial / missing with quality and evidence.",
      inputSchema: { proposalText: z.string().min(1).describe("Proposal text") },
    },
    async (args, extra): Promise<ToolResult> => {
      try {
        const org = getOrg(extra);
        if (org.scope !== "FULL") return failure("This API key is read-only.");
        const config = await buildEngineConfig(org.organizationId);
        const proposal = await parseText(args.proposalText, "proposal");
        const sections = await runSectionMapper(proposal, config);
        return json(await runCompleteness(proposal, sections.sections, config));
      } catch (e) {
        return failure(errMessage(e));
      }
    },
  );

  server.registerTool(
    "analyze_risks",
    {
      title: "Risk agent",
      description:
        "Run the Section Mapper then the Risk agent: identify gaps, unclear " +
        "scope, weak value proposition and commercial risks.",
      inputSchema: { proposalText: z.string().min(1).describe("Proposal text") },
    },
    async (args, extra): Promise<ToolResult> => {
      try {
        const org = getOrg(extra);
        if (org.scope !== "FULL") return failure("This API key is read-only.");
        const config = await buildEngineConfig(org.organizationId);
        const proposal = await parseText(args.proposalText, "proposal");
        const sections = await runSectionMapper(proposal, config);
        return json(await runRisk(proposal, sections.sections, config));
      } catch (e) {
        return failure(errMessage(e));
      }
    },
  );

  server.registerTool(
    "search_proposal",
    {
      title: "Search proposal text",
      description:
        "The retrieval tool used internally by the Compliance and Risk agents — " +
        "lexically rank a proposal's passages against a query. Returns scored " +
        "chunks with citation ids.",
      inputSchema: {
        proposalText: z.string().min(1).describe("Proposal text"),
        query: z.string().min(1).describe("What to search for"),
        topK: z.number().int().min(1).max(20).optional().describe("Max results (default 6)"),
      },
    },
    async (args, extra): Promise<ToolResult> => {
      try {
        getOrg(extra);
        const proposal = await parseText(args.proposalText, "proposal");
        return json(searchProposal(proposal, args.query, args.topK ?? 6));
      } catch (e) {
        return failure(errMessage(e));
      }
    },
  );

  // ─────────────── Read tools (history) ───────────────
  server.registerTool(
    "get_review",
    {
      title: "Get a stored review",
      description: "Fetch a previously-run review's structured report by id.",
      inputSchema: { reviewId: z.string().min(1) },
    },
    async (args, extra): Promise<ToolResult> => {
      try {
        const org = getOrg(extra);
        const review = await prisma.review.findUnique({ where: { id: args.reviewId } });
        if (!review || review.organizationId !== org.organizationId) {
          return failure("Review not found.");
        }
        return json({
          id: review.id,
          title: review.title,
          status: review.status,
          verdict: review.verdict,
          readinessScore: review.readinessScore,
          result: review.result,
        });
      } catch (e) {
        return failure(errMessage(e));
      }
    },
  );

  server.registerTool(
    "list_reviews",
    {
      title: "List reviews",
      description: "List recent reviews for the organization.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 20)"),
      },
    },
    async (args, extra): Promise<ToolResult> => {
      try {
        const org = getOrg(extra);
        const reviews = await prisma.review.findMany({
          where: { organizationId: org.organizationId },
          orderBy: { createdAt: "desc" },
          take: args.limit ?? 20,
          select: {
            id: true,
            title: true,
            status: true,
            verdict: true,
            readinessScore: true,
            createdAt: true,
          },
        });
        return json(reviews);
      } catch (e) {
        return failure(errMessage(e));
      }
    },
  );

  // ─────────────── Resources ───────────────
  server.registerResource(
    "rubric",
    "rubric://current",
    {
      title: "Active review rubric",
      description: "The organization's current review rubric (mandatory sections, weights, thresholds).",
      mimeType: "application/json",
    },
    async (uri, extra) => {
      const org = getOrg(extra);
      const config = await buildEngineConfig(org.organizationId);
      return {
        contents: [
          { uri: uri.href, mimeType: "application/json", text: JSON.stringify(config.rubric, null, 2) },
        ],
      };
    },
  );

  server.registerResource(
    "review",
    new ResourceTemplate("review://{reviewId}", { list: undefined }),
    {
      title: "Stored review",
      description: "A stored review report addressed by id.",
      mimeType: "application/json",
    },
    async (uri, variables, extra) => {
      const org = getOrg(extra);
      const reviewId = String(variables.reviewId);
      const review = await prisma.review.findUnique({ where: { id: reviewId } });
      if (!review || review.organizationId !== org.organizationId) {
        throw new Error("Review not found.");
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(review.result ?? { status: review.status }, null, 2),
          },
        ],
      };
    },
  );

  // ─────────────── Prompt ───────────────
  server.registerPrompt(
    "proposal-review",
    {
      title: "Proposal review methodology",
      description:
        "A guided prompt that walks any LLM through the proposal-review " +
        "methodology, for clients that want the approach without the tools.",
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "You are reviewing a Business Development proposal before submission. " +
              "Work through these stages and produce a structured result:\n" +
              "1. Summarize the proposal (client, engagement, proposed value).\n" +
              "2. If an RFP/TOR is provided, extract every discrete requirement.\n" +
              "3. Check completeness: for each expected section (Executive Summary, " +
              "Scope, Methodology, Timeline, Pricing, Assumptions & Exclusions, Team), " +
              "mark present / partial / missing with evidence.\n" +
              "4. Match each RFP requirement to the proposal (covered / partial / missing).\n" +
              "5. Identify gaps, unclear scope, weak value proposition and commercial risks.\n" +
              "6. Write prioritized recommendations.\n" +
              "7. Score readiness 0-100. HARD RULE: if any mandatory section " +
              "(especially Pricing or Assumptions) is missing, the verdict is " +
              "NOT_READY regardless of the score.\n" +
              "Ground every finding in a quote from the source document.",
          },
        },
      ],
    }),
  );
}
