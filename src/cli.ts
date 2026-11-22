#!/usr/bin/env node
import { hostname } from "node:os";
import { createInterface } from "node:readline/promises";
import { HadsApi, HadsError, explain } from "./api.js";
import { readConfig, writeConfig, clearConfig, configPath, resolve } from "./config.js";
import { snippet, SnippetFormat } from "./snippets.js";
import { runMcp } from "./mcp.js";
import { VERSION } from "./version.js";

type Flags = Record<string, string | boolean>;

function parse(argv: string[]): { args: string[]; flags: Flags } {
  const args: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      args.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2);
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("-")) flags[k] = argv[++i];
      else flags[k] = true;
    } else if (a.startsWith("-") && a.length === 2) {
      const k = { k: "site-key", h: "help", j: "json", v: "version" }[a[1]] || a[1];
      if (["help", "json", "version"].includes(k)) flags[k] = true;
      else flags[k] = argv[++i] ?? true;
    } else args.push(a);
  }
  return { args, flags };
}

const HELP = `hads ${VERSION} — HADS from the terminal and for AI agents

Usage: hads <command> [options]

Account
  login [--email you@site.dev]   Sign in with a code from email; stores a token for this device
  login --token hat_…            Store a token made in the dashboard (/app?tab=tokens)
  logout                         Forget the stored token
  whoami                         The account's balance and where the token comes from

Sites
  sites                          List sites
  sites add <name> <domain> [--tui]
  sites rm <site-id>
  snippet <site-id> [--format html|terminal|ai]   Ready code to embed the slot

Ads
  ads                            List ads
  ads add --site <id> --title … --body … --url … [--topics a,b] [--image URL]
  ads pause <ad-id> | ads resume <ad-id> | ads rm <ad-id>
  topics                         Topic slugs for ads

Numbers and money
  stats [--days 7|30]            Impressions, clicks and CTR
  sources [--days 7|30] [--role publisher|advertiser]
  pricing                        Network quotes and packs
  buy <usd>                      Start a top-up; prints the payment link

Showing ads (no login needed)
  serve --site-key site_… [--format ansi|text|json] [--topic slug]

Tokens
  tokens                         List access tokens
  tokens create <name> [--read]  A token for another machine or agent
  tokens revoke <token-id>

Agents
  mcp                            Run the MCP server on stdio (Claude Code, Cursor, Codex…)

Options: --json (machine output), --engine URL, --token hat_…
Environment: HADS_TOKEN, HADS_ENGINE_URL, HADS_SITE_KEY
Config: ${configPath()}`;

function out(flags: Flags, value: unknown, human?: () => void) {
  if (flags.json || !human) console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
  else human();
}

function table(rows: Record<string, unknown>[], cols: [string, string][]) {
  if (rows.length === 0) return console.log("(none)");
  const widths = cols.map(([key, head]) => Math.max(head.length, ...rows.map((r) => String(r[key] ?? "").length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
  console.log(line(cols.map(([, h]) => h)));
  for (const r of rows) console.log(line(cols.map(([k]) => String(r[k] ?? ""))));
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

function need(value: unknown, message: string): string {
  if (typeof value !== "string" || value === "") {
    console.error(message);
    process.exit(2);
  }
  return value;
}

async function main() {
  const { args, flags } = parse(process.argv.slice(2));
  const [cmd, sub, ...rest] = args;

  if (flags.version) return console.log(VERSION);
  if (!cmd || flags.help || cmd === "help") return console.log(HELP);

  const conf = resolve({ token: flags.token as string, engine: flags.engine as string });
  const api = new HadsApi(conf.engine, conf.token);

  switch (cmd) {
    case "mcp":
      return runMcp(api);

    case "login": {
      if (typeof flags.token === "string") {
        const account = await new HadsApi(conf.engine, flags.token).account();
        writeConfig({ ...readConfig(), token: flags.token, engine: conf.engine });
        return out(flags, { ok: true, account }, () => console.log(`Token saved to ${configPath()}`));
      }
      const email = (flags.email as string) || (await ask("Email: "));
      need(email, "An email is needed.");
      // --code: the code was already requested (scripts, CI); otherwise send one now
      if (typeof flags.code !== "string") {
        const started: any = await api.authStart(email, flags.locale as string);
        if (started?.code) console.error(`(dev engine) code: ${started.code}`);
      }
      const code = (flags.code as string) || (await ask(`Code from the email to ${email}: `));
      const name = (flags.name as string) || `hads-cli on ${hostname()}`;
      const res: any = await api.authVerify(email, need(code, "A code is needed."), name, flags.read ? "read" : "full");
      writeConfig({ token: res.token, engine: conf.engine, email: res.email || email });
      return out(flags, { ok: true, token_name: res.name, scope: res.scope }, () =>
        console.log(`Signed in as ${res.email || email}. Token "${res.name}" (${res.scope}) saved to ${configPath()}`),
      );
    }

    case "logout":
      clearConfig();
      return console.log("Signed out: the stored token is removed. Revoke it in the dashboard if it may have leaked.");

    case "whoami": {
      const account: any = await api.account();
      const source = flags.token ? "--token" : process.env.HADS_TOKEN ? "HADS_TOKEN" : configPath();
      return out(flags, { ...account, engine: conf.engine, token_from: source }, () => {
        console.log(`Engine   ${conf.engine}`);
        if (conf.email) console.log(`Email    ${conf.email}`);
        console.log(`Token    from ${source}`);
        console.log(`Left     ${account.left ?? "—"} impressions`);
        console.log(`Served   ${account.impressions_served ?? account.served ?? 0}   Received ${account.impressions_received ?? account.received ?? 0}`);
      });
    }

    case "sites": {
      if (!sub || sub === "ls" || sub === "list") {
        const sites = await api.sites();
        return out(flags, sites, () =>
          table(sites, [["id", "ID"], ["name", "NAME"], ["domain", "DOMAIN"], ["kind", "KIND"], ["moderation_status", "STATUS"], ["site_key", "SITE KEY"]]),
        );
      }
      if (sub === "add") {
        const [name, domain] = rest;
        const site = await api.addSite({
          name: need(name, "Usage: hads sites add <name> <domain> [--tui]"),
          domain: need(domain, "Usage: hads sites add <name> <domain> [--tui]"),
          kind: flags.tui ? "tui" : "web",
        });
        return out(flags, site, () => console.log(`Added ${site.name}: ${site.site_key} (status: ${site.moderation_status}).`));
      }
      if (sub === "rm" || sub === "delete") {
        await api.deleteSite(need(rest[0], "Usage: hads sites rm <site-id>"));
        return out(flags, { ok: true }, () => console.log("Deleted."));
      }
      break;
    }

    case "snippet": {
      const id = need(sub, "Usage: hads snippet <site-id> [--format html|terminal|ai]");
      const site = (await api.sites()).find((s) => s.id === id || s.site_key === id);
      if (!site) throw new HadsError(404, "site_not_found");
      return console.log(snippet(site, conf.engine, ((flags.format as string) || "html") as SnippetFormat));
    }

    case "ads": {
      if (!sub || sub === "ls" || sub === "list") {
        const ads = await api.ads();
        return out(flags, ads, () =>
          table(ads, [["id", "ID"], ["title", "TITLE"], ["status", "STATUS"], ["moderation_status", "MODERATION"], ["impressions", "VIEWS"], ["clicks", "CLICKS"]]),
        );
      }
      if (sub === "add") {
        const usage = "Usage: hads ads add --site <id> --title … --body … --url … [--topics a,b] [--image URL]";
        const ad = await api.createAd({
          site_id: need(flags.site, usage),
          title: need(flags.title, usage),
          body: need(flags.body, usage),
          url: need(flags.url, usage),
          image_url: typeof flags.image === "string" ? flags.image : undefined,
          topics: typeof flags.topics === "string" ? flags.topics.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        });
        return out(flags, ad, () => console.log(`Created ad ${ad.id} (moderation: ${ad.moderation_status}).`));
      }
      if (sub === "pause" || sub === "resume") {
        const ad = await api.updateAd(need(rest[0], `Usage: hads ads ${sub} <ad-id>`), { status: sub === "pause" ? "paused" : "active" });
        return out(flags, ad, () => console.log(`${sub === "pause" ? "Paused" : "Running"}: ${ad.title}`));
      }
      if (sub === "rm" || sub === "delete") {
        await api.deleteAd(need(rest[0], "Usage: hads ads rm <ad-id>"));
        return out(flags, { ok: true }, () => console.log("Deleted."));
      }
      break;
    }

    case "topics": {
      const res: any = await api.topics();
      const topics = res.topics ?? res;
      return out(flags, topics, () => table(topics, [["slug", "SLUG"], ["name", "NAME"]]));
    }

    case "stats": {
      const res: any = await api.stats(Number(flags.days) || 30, flags.role as string);
      return out(flags, res, () => {
        const daysRows: any[] = Array.isArray(res.daily) ? res.daily : [];
        const sum = daysRows.reduce((a, d) => ({ i: a.i + (d.impressions || 0), c: a.c + (d.clicks || 0) }), { i: 0, c: 0 });
        console.log(`Last ${Number(flags.days) || 30} days: ${sum.i} impressions, ${sum.c} clicks, CTR ${sum.i ? ((100 * sum.c) / sum.i).toFixed(2) : "0.00"}%`);
        if (daysRows.length) table(daysRows, [["day", "DAY"], ["impressions", "VIEWS"], ["clicks", "CLICKS"]]);
      });
    }

    case "sources": {
      const res: any = await api.sources(Number(flags.days) || 30, { role: flags.role as string, site_id: flags.site as string });
      const rows = res.sources ?? [];
      return out(flags, res, () =>
        table(rows, [["role", "ROLE"], ["site_name", "SITE"], ["page_url", "PAGE"], ["impressions", "VIEWS"], ["clicks", "CLICKS"]]),
      );
    }

    case "pricing":
      return out(flags, await api.pricing());

    case "buy": {
      const amount = Number(need(sub, "Usage: hads buy <usd>"));
      const order: any = await api.checkout({ amount_usd: amount });
      return out(flags, order, () => {
        console.log(`Order ${order.id}: ${order.quantity ?? "?"} impressions for $${order.amount_usdc ?? amount} USDC.`);
        if (order.pay_url) console.log(`Pay here: ${order.pay_url}`);
      });
    }

    case "serve": {
      const key = need(flags["site-key"] || process.env.HADS_SITE_KEY, "A site key is needed: --site-key site_… or HADS_SITE_KEY");
      const format = ((flags.format as string) || (flags.json ? "json" : process.stdout.isTTY ? "ansi" : "text")) as any;
      const res = await api.serve(key, { format, topic: (flags.topic as string) || sub });
      if (!res) return;
      return console.log(typeof res === "string" ? res.replace(/\n+$/, "") : JSON.stringify(res, null, 2));
    }

    case "tokens": {
      if (!sub || sub === "ls" || sub === "list") {
        const res: any = await api.tokens();
        return out(flags, res.tokens, () =>
          table(res.tokens, [["id", "ID"], ["name", "NAME"], ["scope", "SCOPE"], ["prefix", "PREFIX"], ["last_used_at", "LAST USED"]]),
        );
      }
      if (sub === "create") {
        const res: any = await api.createToken(need(rest.join(" "), "Usage: hads tokens create <name> [--read]"), flags.read ? "read" : "full");
        return out(flags, res, () => {
          console.log(`Token "${res.name}" (${res.scope}). Copy it now, it is shown once:\n\n  ${res.token}\n`);
          console.log(`MCP:  claude mcp add hads -e HADS_TOKEN=${res.token} -- npx -y hads-cli mcp`);
        });
      }
      if (sub === "revoke" || sub === "rm") {
        await api.revokeToken(need(rest[0], "Usage: hads tokens revoke <token-id>"));
        return out(flags, { ok: true }, () => console.log("Revoked."));
      }
      break;
    }
  }

  console.error(`Unknown command: ${args.join(" ")}\n`);
  console.error(HELP);
  process.exit(2);
}

main().catch((err) => {
  console.error(`hads: ${explain(err)}`);
  process.exit(err instanceof HadsError && err.status === 401 ? 3 : 1);
});
