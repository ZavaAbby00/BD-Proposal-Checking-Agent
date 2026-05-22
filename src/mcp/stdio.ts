/**
 * Local stdio MCP server — lets local MCP clients drive the proposal-review
 * engine directly.
 *
 *   MCP_API_KEY=pck_xxx npm run mcp:stdio
 *
 * The API key (created in the org admin panel) scopes the server to one
 * organization, exactly as the HTTP surface does.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerMcpServer } from "@/mcp/server";
import { verifyMcpToken, type OrgContext } from "@/mcp/context";

try {
  process.loadEnvFile(".env");
} catch {
  /* .env optional */
}

async function main() {
  const apiKey = process.env.MCP_API_KEY;
  if (!apiKey) {
    console.error("MCP_API_KEY environment variable is required.");
    process.exit(1);
  }

  const authInfo = await verifyMcpToken(new Request("http://localhost"), apiKey);
  if (!authInfo) {
    console.error("MCP_API_KEY is invalid, revoked, or its organization is suspended.");
    process.exit(1);
  }
  const data = authInfo.extra as { organizationId: string; scope: string };
  const orgContext: OrgContext = {
    organizationId: data.organizationId,
    scope: data.scope === "READ_ONLY" ? "READ_ONLY" : "FULL",
  };

  const server = new McpServer({
    name: "proposal-checking-agent",
    version: "0.1.0",
  });
  registerMcpServer(server, () => orgContext);

  await server.connect(new StdioServerTransport());
  console.error(
    `Proposal Checking Agent MCP server (stdio) ready — organization ${orgContext.organizationId}, ${orgContext.scope} scope.`,
  );
}

main().catch((e) => {
  console.error("MCP stdio server failed:", e);
  process.exit(1);
});
