import assert from "node:assert/strict";
import test from "node:test";

import { buildChildEnv } from "./index.js";

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
