// The engine's remote MCP endpoint through the official Streamable HTTP client.
// Needs a running engine (HADS_ENGINE_URL) and a token (HADS_TOKEN).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const engine = process.env.HADS_ENGINE_URL;
const token = process.env.HADS_TOKEN;

test("remote MCP: list tools and call one", { skip: !engine || !token }, async () => {
  const client = new Client({ name: "hads-http-test", version: "0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(engine + "/mcp"), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
  );
  const { tools } = await client.listTools();
  assert.ok(tools.some((t) => t.name === "hads_serve_ad"));
  const res = await client.callTool({ name: "hads_pricing", arguments: {} });
  assert.ok(!res.isError);
  assert.ok(JSON.parse(res.content[0].text).pricing || JSON.parse(res.content[0].text).cpc_usd !== undefined);
  await client.close();
});
