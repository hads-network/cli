// Starts `hads mcp` over stdio with the official client and checks the tool list
// and a read call. Needs a running engine and a token: HADS_ENGINE_URL, HADS_TOKEN.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const env = { ...process.env };

async function connect(extra = {}) {
  const client = new Client({ name: "hads-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["dist/cli.js", "mcp"], env: { ...env, ...extra } }));
  return client;
}

test("lists the tools with write hints", async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  for (const n of ["hads_serve_ad", "hads_list_sites", "hads_create_ad", "hads_stats", "hads_site_snippet"]) assert.ok(names.includes(n), n);
  assert.equal(tools.find((t) => t.name === "hads_delete_site").annotations.destructiveHint, true);
  assert.equal(tools.find((t) => t.name === "hads_list_sites").annotations.readOnlyHint, true);
  await client.close();
});

test("read-only mode hides the write tools", async () => {
  const client = await connect({ HADS_READ_ONLY: "1" });
  const names = (await client.listTools()).tools.map((t) => t.name);
  assert.ok(!names.includes("hads_create_ad"));
  assert.ok(names.includes("hads_list_ads"));
  await client.close();
});

test("calls a tool and returns JSON text", { skip: !env.HADS_TOKEN && !env.XDG_CONFIG_HOME }, async () => {
  const client = await connect();
  const res = await client.callTool({ name: "hads_list_sites", arguments: {} });
  assert.ok(!res.isError, res.content?.[0]?.text);
  assert.ok(Array.isArray(JSON.parse(res.content[0].text)));
  const bad = await client.callTool({ name: "hads_serve_ad", arguments: { site_key: "site_nope" } });
  assert.equal(bad.isError, true);
  await client.close();
});
