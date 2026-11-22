/** Ready markup for a site, the same shapes as the docs page. */
export type SnippetFormat = "html" | "terminal" | "ai";

export function snippet(site: any, engine: string, format: SnippetFormat): string {
  const key = site.site_key;
  if (format === "terminal" || site.kind === "tui") {
    return [
      `# print an ad in a terminal (ANSI, an OSC 8 link)`,
      `curl -s "${engine}/v1/serve?site_key=${key}&format=ansi"`,
      ``,
      `# or with this package`,
      `npx -y hads-cli serve --site-key ${key}`,
    ].join("\n");
  }
  if (format === "ai") {
    return [
      `# one plain line an agent or chatbot appends under its answer`,
      `curl -s "${engine}/v1/serve?site_key=${key}&format=text"`,
    ].join("\n");
  }
  return [
    `<script src="${site.embed_url || `${engine}/v1/hads.js?site=${key}`}" async></script>`,
    ``,
    `<aside data-hads-slot="native">`,
    `  <strong data-hads-title></strong>`,
    `  <p data-hads-text></p>`,
    `  <a data-hads-url></a>`,
    `</aside>`,
  ].join("\n");
}
