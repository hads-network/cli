# hads-cli

HADS from the terminal and for AI agents: a CLI and an MCP server for the
[HADS](https://hads.dev) ad exchange, where developer sites, CLI tools and AI
assistants show each other's text ads, one impression for one.

```bash
npx -y hads-cli login          # a code from email, once; a token is stored for this device
npx -y hads-cli sites          # your sites with their site keys
npx -y hads-cli serve --site-key site_…   # an ad in the terminal (counts as an impression)
```

Install it globally to type `hads` instead: `npm i -g hads-cli`.

## Sign in

- `hads login` asks for your email, sends a code, and stores a named access
  token (`hat_…`) in `~/.config/hads/config.json` (mode 0600). Add `--read` for a
  token that can only read.
- `hads login --token hat_…` stores a token you created in the dashboard
  (`/app?tab=tokens`).
- `HADS_TOKEN` overrides the stored token; `HADS_ENGINE_URL` the engine
  (default `https://api.hads.dev`).
- Every token is listed and revocable in the dashboard and with `hads tokens`.
  Your account's main key is never stored by the CLI.

## Commands

| Command | Does |
| --- | --- |
| `hads whoami` | The balance and where the token comes from |
| `hads sites` · `sites add <name> <domain> [--tui]` · `sites rm <id>` | Sites |
| `hads snippet <site-id> [--format html\|terminal\|ai]` | Ready code for the slot |
| `hads ads` · `ads add --site … --title … --body … --url … [--topics a,b]` | Ads |
| `hads ads pause <id>` · `ads resume <id>` · `ads rm <id>` | Ad status |
| `hads topics` | Topic slugs |
| `hads stats [--days 7\|30]` · `hads sources [--role publisher\|advertiser]` | Numbers |
| `hads pricing` · `hads buy <usd>` | Quotes; a payment link for a top-up |
| `hads serve --site-key site_… [--format ansi\|text\|json] [--topic slug]` | An ad to show |
| `hads tokens` · `tokens create <name> [--read]` · `tokens revoke <id>` | Access tokens |
| `hads mcp` | The MCP server on stdio |

Add `--json` to any command for machine output.

## MCP for agents

The token goes in `HADS_TOKEN` (local) or an `Authorization: Bearer` header
(remote, `https://api.hads.dev/mcp`). The dashboard's Tokens tab prints every
setup below with your real token.

**Claude Code**

```bash
claude mcp add hads -e HADS_TOKEN=hat_… -- npx -y hads-cli mcp
# remote
claude mcp add --transport http hads https://api.hads.dev/mcp --header "Authorization: Bearer hat_…"
```

**Codex** (CLI and IDE extension)

```bash
codex mcp add hads --env HADS_TOKEN=hat_… -- npx -y hads-cli mcp
```

```toml
# remote, ~/.codex/config.toml; export HADS_TOKEN=hat_… in your shell profile
[mcp_servers.hads]
url = "https://api.hads.dev/mcp"
bearer_token_env_var = "HADS_TOKEN"
```

**Cursor** (`~/.cursor/mcp.json`), **Claude Desktop** (`claude_desktop_config.json`),
**Windsurf** (`~/.codeium/windsurf/mcp_config.json`), **Gemini CLI** (`~/.gemini/settings.json`):

```json
{
  "mcpServers": {
    "hads": {
      "command": "npx",
      "args": ["-y", "hads-cli", "mcp"],
      "env": { "HADS_TOKEN": "hat_…" }
    }
  }
}
```

Remote, the same `mcpServers` entry with the client's own URL key and the header
`"headers": { "Authorization": "Bearer hat_…" }`: `"url"` in Cursor,
`"serverUrl"` in Windsurf, `"httpUrl"` in Gemini CLI. Claude Desktop's remote
connectors sign in with OAuth, so use the local setup there.

**VS Code / GitHub Copilot** (`.vscode/mcp.json`): the key is `servers`, with
`"type": "stdio"` for the local entry above, or
`{ "type": "http", "url": "https://api.hads.dev/mcp", "headers": { … } }`.

**Zed** (`settings.json`): the same local entry under `"context_servers"`, or
`{ "url": "https://api.hads.dev/mcp", "headers": { … } }`.

Tools: `hads_serve_ad`, `hads_account`, `hads_list_sites`, `hads_add_site`,
`hads_delete_site`, `hads_site_snippet`, `hads_list_ads`, `hads_topics`,
`hads_create_ad`, `hads_set_ad_status`, `hads_delete_ad`, `hads_stats`,
`hads_sources`, `hads_pricing`, `hads_buy_impressions`.

Write tools carry `readOnlyHint: false` (and `destructiveHint` for deletes), so
clients ask before running them. A read-only token, or `HADS_READ_ONLY=1` for
the stdio server, offers only the read tools. `hads_buy_impressions` returns a
payment link for the person to open; it never pays.

## Development

```bash
npm install
npm run build
HADS_ENGINE_URL=http://127.0.0.1:4100 HADS_TOKEN=hat_… npm test
```
