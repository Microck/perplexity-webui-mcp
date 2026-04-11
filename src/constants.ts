/**
 * Shared constants for perplexity-webui-mcp.
 *
 * Centralised here so that `index.ts` and `self-test.ts` reference the
 * same default upstream package spec.
 */

export const UPSTREAM_FROM =
  process.env.PERPLEXITY_UPSTREAM_FROM ??
  "perplexity-webui-scraper[mcp]@git+https://github.com/henrique-coder/perplexity-webui-scraper.git@prod";

export const UPSTREAM_COMMAND =
  process.env.PERPLEXITY_UPSTREAM_COMMAND ?? "perplexity-webui-scraper-mcp";
