#!/usr/bin/env node

import childProcess from "node:child_process";
import nodeUrl from "node:url";

const UPSTREAM_FROM =
  process.env.PERPLEXITY_UPSTREAM_FROM ??
  "perplexity-webui-scraper[mcp]@git+https://github.com/henrique-coder/perplexity-webui-scraper.git@prod";
const UPSTREAM_COMMAND =
  process.env.PERPLEXITY_UPSTREAM_COMMAND ?? "perplexity-webui-scraper-mcp";
const FLARESOLVERR_URL_KEY = "PERPLEXITY_FLARESOLVERR_URL";
const FLARESOLVERR_SOLVE_URL_KEY = "PERPLEXITY_FLARESOLVERR_SOLVE_URL";
const FLARESOLVERR_TIMEOUT_KEY = "PERPLEXITY_FLARESOLVERR_MAX_TIMEOUT";
const HTTP_PROXY_KEYS = ["HTTP_PROXY", "http_proxy"] as const;
const HTTPS_PROXY_KEYS = ["HTTPS_PROXY", "https_proxy"] as const;
const ALL_PROXY_KEYS = ["ALL_PROXY", "all_proxy"] as const;
const NO_PROXY_KEYS = ["NO_PROXY", "no_proxy"] as const;
const FLARESOLVERR_DEFAULT_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

export function buildFlareSolverrPythonBootstrap(): string {
  return String.raw`
import json
import os
import urllib.request

from curl_cffi.requests import BrowserTypeLiteral
from perplexity_webui_scraper.config import ClientConfig
from perplexity_webui_scraper.constants import API_BASE_URL, DEFAULT_HEADERS, SESSION_COOKIE_NAME
from perplexity_webui_scraper.http import HTTPClient
from perplexity_webui_scraper.models import MODELS

DEFAULT_FLARESOLVERR_UA = ${JSON.stringify(FLARESOLVERR_DEFAULT_UA)}

ClientConfig.model_rebuild(_types_namespace={"BrowserTypeLiteral": BrowserTypeLiteral})

# Perplexity currently rejects the upstream "best" model only when it is sent
# as mode="search". Keep the public pplx_ask tool and auto model identifier,
# but send it through the same copilot request path that the working model
# tools use.
object.__setattr__(MODELS.best, "mode", "copilot")


def maybe_enable_flaresolverr():
    flaresolverr_url = os.environ.get(${JSON.stringify(FLARESOLVERR_URL_KEY)}, "").strip()

    if not flaresolverr_url:
        return

    solve_url = os.environ.get(
        ${JSON.stringify(FLARESOLVERR_SOLVE_URL_KEY)},
        "https://www.perplexity.ai/search/new",
    ).strip()
    max_timeout_raw = os.environ.get(${JSON.stringify(FLARESOLVERR_TIMEOUT_KEY)}, "60000").strip()

    try:
        max_timeout = int(max_timeout_raw)
    except ValueError as error:
        raise RuntimeError(
            f"${FLARESOLVERR_TIMEOUT_KEY} must be an integer number of milliseconds: {max_timeout_raw}"
        ) from error

    request = urllib.request.Request(
        f"{flaresolverr_url.rstrip('/')}/v1",
        data=json.dumps({
            "cmd": "request.get",
            "url": solve_url,
            "maxTimeout": max_timeout,
        }).encode(),
        headers={"Content-Type": "application/json"},
    )

    timeout_seconds = max(60.0, max_timeout / 1000 + 30.0)

    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        data = json.load(response)

    if data.get("status") != "ok":
        raise RuntimeError(
            f"FlareSolverr request failed: {data.get('message') or data}"
        )

    solution = data.get("solution") or {}
    cookies = solution.get("cookies") or []

    if not cookies:
        raise RuntimeError("FlareSolverr returned no cookies for Perplexity")

    solved_cookies = {
        cookie["name"]: cookie["value"]
        for cookie in cookies
        if cookie.get("name") and cookie.get("value")
    }

    if not solved_cookies:
        raise RuntimeError("FlareSolverr returned cookies, but none had usable values")

    user_agent = solution.get("userAgent") or DEFAULT_FLARESOLVERR_UA
    original_create_session = HTTPClient._create_session

    # Cloudflare ties the clearance cookies to the browser route that solved them.
    def patched_create_session(self, impersonate):
        session = original_create_session(self, impersonate)
        session.headers["User-Agent"] = user_agent

        for name, value in solved_cookies.items():
            session.cookies.set(name, value)

        return session

    HTTPClient._create_session = patched_create_session
`;
}

const FLARESOLVERR_MCP_SCRIPT = String.raw`
${buildFlareSolverrPythonBootstrap()}

maybe_enable_flaresolverr()

from perplexity_webui_scraper.mcp.server import mcp

mcp.run()
`;

function fail(message: string): never {
  console.error(`perplexity-webui-mcp: ${message}`);
  process.exit(1);
}

function writeFramedMessage(message: string): void {
  process.stdout.write(
    `Content-Length: ${Buffer.byteLength(message, "utf8")}\r\n\r\n${message}`,
  );
}

const UPSTREAM_PROTOCOL_VERSION = "2024-11-05";
const requestedProtocolVersionsById = new Map<string | number, string>();

export function normalizeMessageForUpstream(message: string): string {
  const parsed: unknown = JSON.parse(message);

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("method" in parsed) ||
    (parsed as { method?: unknown }).method !== "initialize" ||
    !("id" in parsed)
  ) {
    return message;
  }

  const initializeMessage = parsed as {
    id: string | number;
    params?: { protocolVersion?: unknown };
  };
  const requestedProtocolVersion = initializeMessage.params?.protocolVersion;

  if (typeof requestedProtocolVersion === "string") {
    requestedProtocolVersionsById.set(initializeMessage.id, requestedProtocolVersion);
    initializeMessage.params = {
      ...initializeMessage.params,
      protocolVersion: UPSTREAM_PROTOCOL_VERSION,
    };

    return JSON.stringify(initializeMessage);
  }

  return message;
}

export function normalizeMessageForParent(message: string): string | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(message);
  } catch {
    return undefined;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("id" in parsed) ||
    !("result" in parsed)
  ) {
    return message;
  }

  const response = parsed as {
    id: string | number;
    result?: {
      protocolVersion?: unknown;
      capabilities?: Record<string, unknown>;
    };
  };
  const requestedProtocolVersion = requestedProtocolVersionsById.get(response.id);

  if (response.result?.capabilities) {
    const { extensions: _extensions, ...capabilities } = response.result.capabilities;
    response.result = {
      ...response.result,
      capabilities,
    };
  }

  if (requestedProtocolVersion && response.result?.protocolVersion) {
    response.result = {
      ...response.result,
      protocolVersion: requestedProtocolVersion,
    };
    requestedProtocolVersionsById.delete(response.id);
  }

  return JSON.stringify(response);
}

function forwardParentInputToChild(child: childProcess.ChildProcess): void {
  let buffer = Buffer.alloc(0);

  process.stdin.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length > 0) {
      const headerEnd = buffer.indexOf("\r\n\r\n");

      if (headerEnd === -1) {
        const newline = buffer.indexOf("\n");

        if (newline === -1) {
          return;
        }

        const line = buffer.subarray(0, newline).toString("utf8").trim();
        buffer = buffer.subarray(newline + 1);

        if (line.length > 0) {
          child.stdin?.write(`${normalizeMessageForUpstream(line)}\n`);
        }

        continue;
      }

      const header = buffer.subarray(0, headerEnd).toString("utf8");
      const lengthMatch = /^Content-Length:\s*(\d+)\s*$/im.exec(header);

      if (!lengthMatch) {
        fail("received malformed MCP frame without Content-Length");
      }

      const bodyStart = headerEnd + 4;
      const bodyLength = Number.parseInt(lengthMatch[1], 10);
      const frameEnd = bodyStart + bodyLength;

      if (buffer.length < frameEnd) {
        return;
      }

      const body = buffer.subarray(bodyStart, frameEnd).toString("utf8");
      buffer = buffer.subarray(frameEnd);
      child.stdin?.write(`${normalizeMessageForUpstream(body)}\n`);
    }
  });

  process.stdin.on("end", () => {
    child.stdin?.end();
  });
}

function forwardChildOutputToParent(child: childProcess.ChildProcess): void {
  child.stdout?.setEncoding("utf8");

  let buffer = "";

  child.stdout?.on("data", (chunk: string) => {
    buffer += chunk;

    while (true) {
      const newline = buffer.indexOf("\n");

      if (newline === -1) {
        return;
      }

      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);

      if (line.length > 0) {
        const normalizedMessage = normalizeMessageForParent(line);

        if (normalizedMessage) {
          writeFramedMessage(normalizedMessage);
        } else if (process.env.PERPLEXITY_DEBUG_STDERR === "1") {
          process.stderr.write(`perplexity-webui-mcp: dropped non-json upstream stdout: ${line}\n`);
        }
      }
    }
  });
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

function clearMirroredValue({
  env,
  keys,
}: {
  env: NodeJS.ProcessEnv;
  keys: readonly string[];
}): void {
  keys.forEach((key) => {
    delete env[key];
  });
}

export function shouldUseFlareSolverr(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env[FLARESOLVERR_URL_KEY]?.trim());
}

export function buildChildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {
    ...env,
  };

  const token = env.PERPLEXITY_SESSION_TOKEN?.trim();
  if (token) {
    childEnv.PERPLEXITY_SESSION_TOKEN = token;
  }

  const flaresolverrUrl = env[FLARESOLVERR_URL_KEY]?.trim();
  if (flaresolverrUrl) {
    childEnv[FLARESOLVERR_URL_KEY] = flaresolverrUrl;
  }

  const flaresolverrSolveUrl = env[FLARESOLVERR_SOLVE_URL_KEY]?.trim();
  if (flaresolverrSolveUrl) {
    childEnv[FLARESOLVERR_SOLVE_URL_KEY] = flaresolverrSolveUrl;
  }

  const flaresolverrTimeout = env[FLARESOLVERR_TIMEOUT_KEY]?.trim();
  if (flaresolverrTimeout) {
    childEnv[FLARESOLVERR_TIMEOUT_KEY] = flaresolverrTimeout;
  }

  if (flaresolverrUrl) {
    // FlareSolverr clears the challenge inside its own browser session, so the
    // upstream client should not reuse an unrelated HTTP/SOCKS proxy route.
    clearMirroredValue({ env: childEnv, keys: HTTP_PROXY_KEYS });
    clearMirroredValue({ env: childEnv, keys: HTTPS_PROXY_KEYS });
    clearMirroredValue({ env: childEnv, keys: ALL_PROXY_KEYS });
    clearMirroredValue({ env: childEnv, keys: NO_PROXY_KEYS });

    return childEnv;
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

export function buildRunnerArgs(env: NodeJS.ProcessEnv): string[] {
  if (shouldUseFlareSolverr(env)) {
    return ["--from", UPSTREAM_FROM, "python", "-c", FLARESOLVERR_MCP_SCRIPT];
  }

  return ["--from", UPSTREAM_FROM, UPSTREAM_COMMAND];
}

function main(): void {
  const token = process.env.PERPLEXITY_SESSION_TOKEN?.trim();
  if (!token) {
    fail(
      "PERPLEXITY_SESSION_TOKEN is required. Set it in your MCP client environment.",
    );
  }

  const child = childProcess.spawn("uvx", buildRunnerArgs(process.env), {
    // Keep the upstream Python server's Rich startup banner away from the MCP
    // client's startup stream. Codex is strict during initialize, and inherited
    // stderr has caused this bridge to be killed while handshaking.
    stdio: ["pipe", "pipe", "pipe"],
    env: buildChildEnv(process.env),
  });

  forwardParentInputToChild(child);
  forwardChildOutputToParent(child);
  child.stderr?.on("data", (chunk: Buffer) => {
    if (process.env.PERPLEXITY_DEBUG_STDERR === "1") {
      process.stderr.write(chunk);
    }
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

if (currentEntryPoint && import.meta.url === nodeUrl.pathToFileURL(currentEntryPoint).href) {
  main();
}
