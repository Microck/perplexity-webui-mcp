#!/usr/bin/env node

import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { UPSTREAM_FROM, UPSTREAM_COMMAND } from "./constants.js";
const HTTP_PROXY_KEYS = ["HTTP_PROXY", "http_proxy"] as const;
const HTTPS_PROXY_KEYS = ["HTTPS_PROXY", "https_proxy"] as const;
const ALL_PROXY_KEYS = ["ALL_PROXY", "all_proxy"] as const;
const NO_PROXY_KEYS = ["NO_PROXY", "no_proxy"] as const;

function fail(message: string): never {
  console.error(`perplexity-webui-mcp: ${message}`);
  process.exit(1);
}

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

// Robust entry guard: only run main() when executed directly as a script,
// not when imported as a module. Checks both process.argv[1] match and
// whether we're being run via the npm bin entry point.
const isDirectRun = (() => {
  try {
    const entry = process.argv[1];
    if (!entry) return false;
    const entryUrl = pathToFileURL(entry).href;
    if (import.meta.url === entryUrl) return true;
    // Also match when run via npx or globally linked bin (resolved paths)
    const entryPath = new URL(entryUrl).pathname;
    const modulePath = new URL(import.meta.url).pathname;
    return entryPath.endsWith("dist/index.js") && modulePath.endsWith("dist/index.js") && process.argv[1]?.includes("perplexity-webui-mcp");
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  main();
}
