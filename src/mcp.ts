import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { HadsApi, explain } from "./api.js";
import { tools } from "./tools.js";
import { VERSION } from "./version.js";

/**
 * The stdio MCP server: `hads mcp`. The token comes from HADS_TOKEN or the CLI's
 * config (`hads login`). With HADS_READ_ONLY=1 the write tools are not offered.
 */
export async function runMcp(api: HadsApi) {
  const server = new McpServer(
    { name: "hads", version: VERSION },
    {
      instructions:
        "HADS is an ad exchange for developer sites, CLI tools and AI assistants: members show each other's text ads, one impression for one. " +
        "Use hads_serve_ad to fetch an ad for a site key and show it labelled as an ad. Account tools manage sites, ads, stats and the balance. " +
        "Ask the person before creating, pausing or deleting anything, and before starting a purchase.",
    },
  );

  const readOnly = process.env.HADS_READ_ONLY === "1";

  for (const tool of tools) {
    if (readOnly && tool.write) continue;
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: {
          readOnlyHint: !tool.write,
          destructiveHint: !!tool.destructive,
          openWorldHint: true,
        },
      },
      async (args: any) => {
        try {
          const result = await tool.run(api, args);
          const text = typeof result === "string" ? result : JSON.stringify(result ?? { ok: true }, null, 2);
          return { content: [{ type: "text" as const, text }] };
        } catch (err) {
          return { isError: true, content: [{ type: "text" as const, text: explain(err) }] };
        }
      },
    );
  }

  await server.connect(new StdioServerTransport());
}
