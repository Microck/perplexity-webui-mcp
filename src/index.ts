#!/usr/bin/env node

import { spawn } from "node:child_process";

const UPSTREAM_FROM =
  process.env.PERPLEXITY_UPSTREAM_FROM ?? "perplexity-webui-scraper[mcp]@latest";
const UPSTREAM_COMMAND =
  process.env.PERPLEXITY_UPSTREAM_COMMAND ?? "perplexity-webui-scraper-mcp";

function fail(message: string): never {
  console.error(`perplexity-webui-mcp: ${message}`);
  process.exit(1);
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
    env: {
      ...process.env,
      PERPLEXITY_SESSION_TOKEN: token,
    },
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

main();
