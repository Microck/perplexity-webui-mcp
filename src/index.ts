#!/usr/bin/env node

/**
 * @module perplexity-webui-mcp
 *
 * MCP wrapper around `perplexity-webui-scraper`. Spawns the upstream Python
 * MCP server via `uvx`, propagates proxy environment variables (with upper/
 * lower-case sync), and forwards OS signals to the child process.
 *
 * Configuration is through environment variables:
 * - `PERPLEXITY_SESSION_TOKEN` (required) — Perplexity WebUI session cookie.
 * - `PERPLEXITY_UPSTREAM_FROM` — uvx package spec for the upstream scraper.
 * - `PERPLEXITY_UPSTREAM_COMMAND` — binary name inside the uvx package.
 * - `PERPLEXITY_PROXY_URL` — convenience var that sets all proxy env vars.
 * - `PERPLEXITY_NO_PROXY` — hosts to exclude from proxying.
 */

import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const UPSTREAM_FROM =
  process.env.PERPLEXITY_UPSTREAM_FROM ??
  "perplexity-webui-scraper[mcp]@git+https://github.com/henrique-coder/perplexity-webui-scraper.git@prod";
const UPSTREAM_COMMAND =
  process.env.PERPLEXITY_UPSTREAM_COMMAND ?? "perplexity-webui-scraper-mcp";
const HTTP_PROXY_KEYS = ["HTTP_PROXY", "http_proxy"] as const;
const HTTPS_PROXY_KEYS = ["HTTPS_PROXY", "https_proxy"] as const;
const ALL_PROXY_KEYS = ["ALL_PROXY", "all_proxy"] as const;
const NO_PROXY_KEYS = ["NO_PROXY", "no_proxy"] as const;

/** Print an error message to stderr and exit with code 1. */
function fail(message: string): never {
  console.error(`perplexity-webui-mcp: ${message}`);
  process.exit(1);
}

/**
 * Return the first non-empty trimmed value found in `env` for the given keys.
 *
 * @param env - The environment variables object to search.
 * @param keys - An ordered list of environment variable names to check.
 * @returns The first trimmed non-empty value, or `undefined` if none found.
 */
function getFirstNonEmptyValue({
  env,
  keys,
}: {
  env: NodeJS.ProcessEnv;
  keys: readonly string[];
}): string | undefined {
  return keys
    .map((key) => {
      return env[key]?.trim();
    })
    .find((value) => {
      return Boolean(value);
    });
}

/**
 * Set all keys in the given group to the same value, ensuring upper and lower
 * case variants stay in sync (e.g. `HTTPS_PROXY` and `https_proxy`).
 *
 * @param env - The environment variables object to mutate.
 * @param keys - The environment variable names to set.
 * @param value - The value to assign to every key.
 */
function setMirroredValue({
  env,
  keys,
  value,
}: {
  env: NodeJS.ProcessEnv;
  keys: readonly string[];
  value: string;
}): void {
  keys.forEach((key) => {
    env[key] = value;
  });
}

/**
 * Build the environment object for the child process.
 *
 * Copies the parent environment, trims the session token, and propagates
 * proxy settings from either standard proxy env vars (`HTTPS_PROXY`, etc.)
 * or the convenience `PERPLEXITY_PROXY_URL` / `PERPLEXITY_NO_PROXY` vars.
 * Upper and lower case proxy variants are kept in sync.
 *
 * @param env - The parent `process.env` to inherit from.
 * @returns A new environment object for the child process.
 */
export function buildChildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {
    ...env,
  };

  const token = env.PERPLEXITY_SESSION_TOKEN?.trim();
  if (token) {
    childEnv.PERPLEXITY_SESSION_TOKEN = token;
  }

  const proxyUrl = env.PERPLEXITY_PROXY_URL?.trim();
  const noProxy = env.PERPLEXITY_NO_PROXY?.trim();

  const httpProxy = getFirstNonEmptyValue({
    env,
    keys: HTTP_PROXY_KEYS,
  }) ?? proxyUrl;
  const httpsProxy = getFirstNonEmptyValue({
    env,
    keys: HTTPS_PROXY_KEYS,
  }) ?? proxyUrl;
  const allProxy = getFirstNonEmptyValue({
    env,
    keys: ALL_PROXY_KEYS,
  }) ?? proxyUrl;
  const noProxyValue = getFirstNonEmptyValue({
    env,
    keys: NO_PROXY_KEYS,
  }) ?? noProxy;

  if (httpProxy) {
    setMirroredValue({
      env: childEnv,
      keys: HTTP_PROXY_KEYS,
      value: httpProxy,
    });
  }

  if (httpsProxy) {
    setMirroredValue({
      env: childEnv,
      keys: HTTPS_PROXY_KEYS,
      value: httpsProxy,
    });
  }

  if (allProxy) {
    setMirroredValue({
      env: childEnv,
      keys: ALL_PROXY_KEYS,
      value: allProxy,
    });
  }

  if (noProxyValue) {
    setMirroredValue({
      env: childEnv,
      keys: NO_PROXY_KEYS,
      value: noProxyValue,
    });
  }

  return childEnv;
}

/**
 * Entry point — validate the session token, spawn the upstream MCP server
 * via `uvx`, and forward signals (SIGINT, SIGTERM) to the child process.
 * Exits with the child's exit code.
 */
function main(): void {
  const token = process.env.PERPLEXITY_SESSION_TOKEN?.trim();
  if (!token) {
    fail(
      "PERPLEXITY_SESSION_TOKEN is required. Set it in your MCP client environment.",
    );
  }

  const child = spawn("uvx", ["--from", UPSTREAM_FROM, UPSTREAM_COMMAND], {
    stdio: "inherit",
    env: buildChildEnv(process.env),
  });

  child.on("error", (error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      fail(
        "`uvx` was not found. Install uv first: https://docs.astral.sh/uv/getting-started/installation/",
      );
    }

    fail(`failed to start upstream MCP server: ${String(error)}`);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  const forwardSignal = (signal: NodeJS.Signals) => {
    process.on(signal, () => {
      if (!child.killed) {
        child.kill(signal);
      }
    });
  };

  forwardSignal("SIGINT");
  forwardSignal("SIGTERM");
}

const currentEntryPoint = process.argv[1];

if (currentEntryPoint && import.meta.url === pathToFileURL(currentEntryPoint).href) {
  main();
}
