import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChildEnv,
  buildRunnerArgs,
  normalizeMessageForParent,
  normalizeMessageForUpstream,
  shouldUseFlareSolverr,
} from "./index.js";

test("buildChildEnv mirrors explicit proxy env vars across upper and lower case", () => {
  const childEnv = buildChildEnv({
    PERPLEXITY_SESSION_TOKEN: "  token-value  ",
    HTTPS_PROXY: "http://proxy.internal:8080",
    NO_PROXY: "localhost,127.0.0.1",
  });

  assert.equal(childEnv.PERPLEXITY_SESSION_TOKEN, "token-value");
  assert.equal(childEnv.HTTPS_PROXY, "http://proxy.internal:8080");
  assert.equal(childEnv.https_proxy, "http://proxy.internal:8080");
  assert.equal(childEnv.NO_PROXY, "localhost,127.0.0.1");
  assert.equal(childEnv.no_proxy, "localhost,127.0.0.1");
});

test("buildChildEnv expands PERPLEXITY_PROXY_URL into standard proxy env vars", () => {
  const childEnv = buildChildEnv({
    PERPLEXITY_SESSION_TOKEN: "token-value",
    PERPLEXITY_PROXY_URL: "socks5://127.0.0.1:1080",
    PERPLEXITY_NO_PROXY: "localhost,.internal",
  });

  assert.equal(childEnv.HTTP_PROXY, "socks5://127.0.0.1:1080");
  assert.equal(childEnv.http_proxy, "socks5://127.0.0.1:1080");
  assert.equal(childEnv.HTTPS_PROXY, "socks5://127.0.0.1:1080");
  assert.equal(childEnv.https_proxy, "socks5://127.0.0.1:1080");
  assert.equal(childEnv.ALL_PROXY, "socks5://127.0.0.1:1080");
  assert.equal(childEnv.all_proxy, "socks5://127.0.0.1:1080");
  assert.equal(childEnv.NO_PROXY, "localhost,.internal");
  assert.equal(childEnv.no_proxy, "localhost,.internal");
});

test("buildChildEnv does not override already-set standard proxy env vars", () => {
  const childEnv = buildChildEnv({
    PERPLEXITY_SESSION_TOKEN: "token-value",
    PERPLEXITY_PROXY_URL: "socks5://127.0.0.1:1080",
    HTTP_PROXY: "http://existing-http:8080",
    HTTPS_PROXY: "http://existing-https:8443",
    ALL_PROXY: "socks5://existing-all:1080",
  });

  assert.equal(childEnv.HTTP_PROXY, "http://existing-http:8080");
  assert.equal(childEnv.http_proxy, "http://existing-http:8080");
  assert.equal(childEnv.HTTPS_PROXY, "http://existing-https:8443");
  assert.equal(childEnv.https_proxy, "http://existing-https:8443");
  assert.equal(childEnv.ALL_PROXY, "socks5://existing-all:1080");
  assert.equal(childEnv.all_proxy, "socks5://existing-all:1080");
});

test("buildChildEnv strips proxy env vars when FlareSolverr mode is enabled", () => {
  const childEnv = buildChildEnv({
    PERPLEXITY_SESSION_TOKEN: "token-value",
    PERPLEXITY_FLARESOLVERR_URL: " http://127.0.0.1:8191 ",
    PERPLEXITY_FLARESOLVERR_SOLVE_URL: " https://www.perplexity.ai/search/new ",
    PERPLEXITY_FLARESOLVERR_MAX_TIMEOUT: " 90000 ",
    HTTP_PROXY: "http://existing-http:8080",
    HTTPS_PROXY: "http://existing-https:8443",
    ALL_PROXY: "socks5://existing-all:1080",
    NO_PROXY: "localhost,.internal",
  });

  assert.equal(childEnv.PERPLEXITY_FLARESOLVERR_URL, "http://127.0.0.1:8191");
  assert.equal(
    childEnv.PERPLEXITY_FLARESOLVERR_SOLVE_URL,
    "https://www.perplexity.ai/search/new",
  );
  assert.equal(childEnv.PERPLEXITY_FLARESOLVERR_MAX_TIMEOUT, "90000");
  assert.equal(childEnv.HTTP_PROXY, undefined);
  assert.equal(childEnv.HTTPS_PROXY, undefined);
  assert.equal(childEnv.ALL_PROXY, undefined);
  assert.equal(childEnv.NO_PROXY, undefined);
});

test("FlareSolverr mode switches the wrapper to the python bridge", () => {
  assert.equal(shouldUseFlareSolverr({}), false);
  assert.equal(
    shouldUseFlareSolverr({ PERPLEXITY_FLARESOLVERR_URL: "http://127.0.0.1:8191" }),
    true,
  );

  const args = buildRunnerArgs({
    PERPLEXITY_FLARESOLVERR_URL: "http://127.0.0.1:8191",
  });

  assert.equal(args[0], "--from");
  assert.equal(args[2], "python");
  assert.equal(args[3], "-c");
  assert.match(args[4] ?? "", /maybe_enable_flaresolverr/);
  assert.match(args[4] ?? "", /ClientConfig\.model_rebuild/);
  assert.match(args[4] ?? "", /object\.__setattr__\(MODELS\.best, "mode", "copilot"\)/);
});

test("FlareSolverr bridge normalizes initialize protocol for upstream compatibility", () => {
  const upstreamMessage = normalizeMessageForUpstream(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0.0" },
    },
  }));

  assert.equal(JSON.parse(upstreamMessage).params.protocolVersion, "2024-11-05");

  const parentMessage = normalizeMessageForParent(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: { listChanged: true },
        extensions: { "io.modelcontextprotocol/ui": {} },
      },
      serverInfo: { name: "test", version: "1.0.0" },
    },
  }));

  assert.ok(parentMessage);
  assert.equal(JSON.parse(parentMessage).result.protocolVersion, "2025-06-18");
  assert.equal(JSON.parse(parentMessage).result.capabilities.extensions, undefined);

  const passthrough = JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });

  assert.equal(normalizeMessageForUpstream(passthrough), passthrough);
});

test("bridge drops non-json upstream stdout instead of framing it as MCP", () => {
  assert.equal(normalizeMessageForParent("Installed 1 package in 12ms"), undefined);
});
