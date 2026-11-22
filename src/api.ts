export class HadsError extends Error {
  constructor(
    public status: number,
    public code: string,
    public details?: unknown,
  ) {
    super(code);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export class HadsApi {
  constructor(
    public engine: string,
    public token?: string,
  ) {}

  private async request<T = any>(
    method: string,
    path: string,
    opts: { query?: Query; body?: unknown; auth?: boolean; accept?: string } = {},
  ): Promise<T> {
    const url = new URL(this.engine + path);
    for (const [k, v] of Object.entries(opts.query || {})) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { accept: opts.accept || "application/json", "user-agent": "hads-cli" };
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (opts.auth !== false) {
      if (!this.token) throw new HadsError(401, "not_logged_in");
      headers.authorization = `Bearer ${this.token}`;
    }
    const res = await fetch(url, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    if (!res.ok) {
      let body: any = {};
      try {
        body = JSON.parse(text);
      } catch {
        body = { error: text.slice(0, 200) };
      }
      throw new HadsError(res.status, body.error || `http_${res.status}`, body.details ?? body.topics);
    }
    if (!text) return undefined as T;
    const type = res.headers.get("content-type") || "";
    return (type.includes("json") ? JSON.parse(text) : text) as T;
  }

  // auth
  authStart(email: string, locale?: string) {
    return this.request("POST", "/v1/auth/start", { auth: false, body: { email, locale } });
  }
  authVerify(email: string, code: string, tokenName: string, scope = "full") {
    return this.request("POST", "/v1/auth/verify", {
      auth: false,
      body: { email, code, token_name: tokenName, scope },
    });
  }

  // account
  account() {
    return this.request("GET", "/v1/account");
  }
  pricing() {
    return this.request("GET", "/v1/pricing", { auth: false });
  }
  checkout(opts: { amount_usd?: number; quantity?: number }) {
    return this.request("POST", "/v1/payments/checkout", { body: opts });
  }
  payment(id: string) {
    return this.request("GET", `/v1/payments/${encodeURIComponent(id)}`);
  }

  // sites
  async sites() {
    const res = await this.request("GET", "/v1/sites");
    return res.sites as any[];
  }
  addSite(site: { name: string; domain: string; kind?: "web" | "tui" }) {
    return this.request("POST", "/v1/sites", { body: site });
  }
  deleteSite(id: string) {
    return this.request("DELETE", `/v1/sites/${encodeURIComponent(id)}`);
  }

  // ads
  async ads() {
    const res = await this.request("GET", "/v1/ads");
    return (res.ads ?? res) as any[];
  }
  topics() {
    return this.request("GET", "/v1/topics", { auth: false });
  }
  createAd(ad: { site_id: string; title: string; body: string; url: string; image_url?: string; topics?: string[] }) {
    return this.request("POST", "/v1/ads", { body: ad });
  }
  updateAd(id: string, attrs: Record<string, unknown>) {
    return this.request("PATCH", `/v1/ads/${encodeURIComponent(id)}`, { body: attrs });
  }
  deleteAd(id: string) {
    return this.request("DELETE", `/v1/ads/${encodeURIComponent(id)}`);
  }

  // numbers
  stats(days = 30, role?: string) {
    return this.request("GET", "/v1/stats", { query: { days, role } });
  }
  sources(days = 30, opts: { role?: string; site_id?: string; limit?: number } = {}) {
    return this.request("GET", "/v1/sources", { query: { days, ...opts } });
  }

  // serving (by site key, no account token)
  serve(siteKey: string, opts: { format?: "json" | "text" | "ansi" | "html"; topic?: string; slot?: string } = {}) {
    return this.request("GET", "/v1/serve", {
      auth: false,
      query: { site_key: siteKey, format: opts.format || "json", topic: opts.topic, slot: opts.slot },
      accept: opts.format && opts.format !== "json" ? "text/plain, */*" : "application/json",
    });
  }

  // tokens
  tokens() {
    return this.request("GET", "/v1/tokens");
  }
  createToken(name: string, scope: "full" | "read" = "full") {
    return this.request("POST", "/v1/tokens", { body: { name, scope } });
  }
  revokeToken(id: string) {
    return this.request("DELETE", `/v1/tokens/${encodeURIComponent(id)}`);
  }
}

/** Human words for the engine's error codes. */
export function explain(err: unknown): string {
  if (err instanceof HadsError) {
    const known: Record<string, string> = {
      not_logged_in: "Not logged in. Run `hads login` or set HADS_TOKEN.",
      unauthorized: "The token was refused (revoked, or read-only for this action). Run `hads login` again.",
      site_not_found: "No such site: check the site id or site key.",
      site_not_approved: "The site has not passed moderation yet; ads can be added once it is approved.",
      topics_required: "Pick at least one topic (see `hads topics`).",
      too_many_topics: "Too many topics for one ad.",
      invalid_topics: "Unknown topics: " + JSON.stringify(err.details ?? []),
      code_invalid: "The code is wrong.",
      code_expired: "The code has expired. Run `hads login` again.",
      code_attempts_exceeded: "Too many wrong codes. Run `hads login` again for a new one.",
      too_many_codes: "A code was sent a moment ago. Wait a minute and run `hads login` again.",
      validation_failed: "Validation failed: " + JSON.stringify(err.details ?? {}),
    };
    return known[err.code] || `${err.code} (HTTP ${err.status})`;
  }
  return err instanceof Error ? err.message : String(err);
}
