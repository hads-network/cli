import { z } from "zod";
import { HadsApi } from "./api.js";
import { snippet } from "./snippets.js";

/**
 * The MCP tools. Each one maps to one engine call and returns plain JSON, so an
 * agent can read the result and chain the next call. Write tools say so in their
 * annotations, so clients can ask before running them.
 */
export type ToolDef = {
  name: string;
  title: string;
  description: string;
  input: z.ZodRawShape;
  write?: boolean;
  destructive?: boolean;
  run: (api: HadsApi, args: any) => Promise<unknown>;
};

const days = z.union([z.literal(7), z.literal(30)]).optional().describe("Period in days: 7 or 30 (default 30)");

export const tools: ToolDef[] = [
  {
    name: "hads_serve_ad",
    title: "Get an ad to show",
    description:
      "Fetch one ad from the HADS pool for a site key, to show under an answer, in a terminal or on a page. " +
      "Showing it counts as an impression for that site. Use format=text for one line to append to a chat answer, " +
      "ansi for a terminal, json for the fields. Always label it as an ad when you show it.",
    input: {
      site_key: z.string().describe("The site key (site_…) of the surface that shows the ad"),
      format: z.enum(["text", "json", "ansi"]).optional().describe("text (default), json or ansi"),
      topic: z.string().optional().describe("A topic slug hint, e.g. programming (see hads_topics)"),
    },
    run: (api, a) => api.serve(a.site_key, { format: a.format || "text", topic: a.topic }),
  },
  {
    name: "hads_account",
    title: "Account balance",
    description: "The account's impression balance: impressions served and received, clicks, what is left to spend.",
    input: {},
    run: (api) => api.account(),
  },
  {
    name: "hads_list_sites",
    title: "List sites",
    description: "Every site (web page, CLI tool or AI surface) on the account with its site key, moderation status and counters.",
    input: {},
    run: (api) => api.sites(),
  },
  {
    name: "hads_add_site",
    title: "Add a site",
    description:
      "Add a site to the exchange. kind=web for a website, kind=tui for a CLI/TUI tool or an AI surface (domain is then a name such as myapp-cli). " +
      "The site goes to moderation before its first impression.",
    input: {
      name: z.string().describe("A name for the site"),
      domain: z.string().describe("The domain (blog.example) or, for kind=tui, the tool's name"),
      kind: z.enum(["web", "tui"]).optional().describe("web (default) or tui"),
    },
    write: true,
    run: (api, a) => api.addSite({ name: a.name, domain: a.domain, kind: a.kind || "web" }),
  },
  {
    name: "hads_delete_site",
    title: "Delete a site",
    description: "Delete a site from the account. Its ads stop showing.",
    input: { site_id: z.string().describe("The site's id") },
    write: true,
    destructive: true,
    run: (api, a) => api.deleteSite(a.site_id),
  },
  {
    name: "hads_site_snippet",
    title: "Snippet to embed a site's slot",
    description:
      "Ready code to put HADS into a project for one site: html (script tag + data-hads-* slot), terminal (curl / npx command) or ai (one text line for agent answers).",
    input: {
      site_id: z.string().describe("The site's id (see hads_list_sites)"),
      format: z.enum(["html", "terminal", "ai"]).optional().describe("html (default), terminal or ai"),
    },
    run: async (api, a) => {
      const site = (await api.sites()).find((s) => s.id === a.site_id || s.site_key === a.site_id);
      if (!site) return { error: "site_not_found" };
      return { site: site.name, site_key: site.site_key, snippet: snippet(site, api.engine, a.format || "html") };
    },
  },
  {
    name: "hads_list_ads",
    title: "List ads",
    description: "The account's ads with status (active/paused), moderation, topics, impressions and clicks.",
    input: {},
    run: (api) => api.ads(),
  },
  {
    name: "hads_topics",
    title: "Topic catalog",
    description: "The topic slugs an ad can be tagged with.",
    input: {},
    run: (api) => api.topics(),
  },
  {
    name: "hads_create_ad",
    title: "Create an ad",
    description:
      "Create a text ad for one of the account's approved sites. The URL must be on the site's domain. " +
      "Title up to 80 characters, body up to 280; topics are slugs from hads_topics.",
    input: {
      site_id: z.string().describe("The site the ad promotes"),
      title: z.string().max(80),
      body: z.string().max(280),
      url: z.string().url().describe("Where a click goes, on the site's domain"),
      image_url: z.string().url().optional(),
      topics: z.array(z.string()).optional(),
    },
    write: true,
    run: (api, a) => api.createAd(a),
  },
  {
    name: "hads_set_ad_status",
    title: "Pause or resume an ad",
    description: "Pause an ad (status=paused) or run it again (status=active).",
    input: { ad_id: z.string(), status: z.enum(["active", "paused"]) },
    write: true,
    run: (api, a) => api.updateAd(a.ad_id, { status: a.status }),
  },
  {
    name: "hads_delete_ad",
    title: "Delete an ad",
    description: "Delete an ad for good.",
    input: { ad_id: z.string() },
    write: true,
    destructive: true,
    run: (api, a) => api.deleteAd(a.ad_id),
  },
  {
    name: "hads_stats",
    title: "Impressions and clicks",
    description: "Daily and hourly impressions, clicks and CTR, by country, device and browser, for 7 or 30 days.",
    input: { days, role: z.enum(["publisher", "advertiser"]).optional() },
    run: async (api, a) => {
      // the hourly tables are left out: they cost an agent context and rarely answer a question
      const s: any = await api.stats(a.days || 30, a.role);
      const daily: any[] = Array.isArray(s.daily) ? s.daily : [];
      const impressions = daily.reduce((n, d) => n + (d.impressions || 0), 0);
      const clicks = daily.reduce((n, d) => n + (d.clicks || 0), 0);
      return {
        days: s.days,
        since: s.since,
        role: s.role,
        totals: { impressions, clicks, ctr: impressions ? clicks / impressions : 0 },
        daily,
        by_country: s.by_country,
        by_device: s.by_device,
        by_browser: s.by_browser,
      };
    },
  },
  {
    name: "hads_sources",
    title: "Where impressions come from",
    description: "Impressions and clicks by site and page: on your pages (role=publisher) or of your ads elsewhere (role=advertiser).",
    input: { days, role: z.enum(["publisher", "advertiser"]).optional(), site_id: z.string().optional() },
    run: (api, a) => api.sources(a.days || 30, { role: a.role, site_id: a.site_id }),
  },
  {
    name: "hads_pricing",
    title: "Network pricing",
    description: "The network's quotes: impression rate, click value, CPC, CTR, price per 1,000 impressions, minimum top-up and packs.",
    input: {},
    run: (api) => api.pricing(),
  },
  {
    name: "hads_buy_impressions",
    title: "Buy impressions",
    description:
      "Start a top-up: returns a payment link for the person to open and pay, by card or in USDC on Solana. Nothing is charged until they pay. " +
      "Show the link to the person; never pay on their behalf.",
    input: {
      amount_usd: z.number().min(1).describe("Amount in USD (the network minimum applies, see hads_pricing)"),
      method: z
        .enum(["card", "usdc"])
        .optional()
        .describe("card (Stripe) or usdc (Solana Pay); default card. hads_pricing lists what is on offer"),
    },
    write: true,
    run: (api, a) => api.checkout({ amount_usd: a.amount_usd, method: a.method }),
  },
];
