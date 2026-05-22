import { createMcpHandler, experimental_withMcpAuth } from "mcp-handler";
import { registerMcpServer } from "@/mcp/server";
import { verifyMcpToken, orgFromExtra } from "@/mcp/context";

export const runtime = "nodejs";
// A full review runs several LLM calls — allow generous headroom.
export const maxDuration = 300;

/**
 * MCP server (Streamable HTTP). The proposal-review engine exposed as MCP
 * tools / resources / prompts so any MCP client can drive it.
 *
 *   Endpoint : POST /api/mcp/mcp
 *   Auth     : Authorization: Bearer <organization API key>
 */
const handler = createMcpHandler(
  (server) => {
    registerMcpServer(server, orgFromExtra);
  },
  {},
  { basePath: "/api/mcp" },
);

// Every request must carry a valid organization API key.
const authedHandler = experimental_withMcpAuth(handler, verifyMcpToken, {
  required: true,
});

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
