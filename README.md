<h1 align="center">perplexity-webui-mcp</h1>

<p align="center">
  MCP server for querying Perplexity Pro via WebUI session token.
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/perplexity-webui-mcp?label=npm&color=orange" alt="npm">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
  <img src="https://img.shields.io/badge/language-typescript-blue" alt="language">
  <img src="https://img.shields.io/badge/node-%3E%3D18-green" alt="node">
  <a href="https://github.com/Microck/opencode-studio"><img src="https://img.shields.io/badge/opencode-studio-brown?logo=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAABiElEQVR4nF2Sv0tWcRTGPyeVIpCWwmyJGqQagsqCsL2hhobsD3BvdWhoj%2F6CiIKaoqXBdMjKRWwQgqZ%2BokSvkIhg9BOT9xPn9Vx79cD3cu6953zP8zznCQB1V0S01d3AKeAKcBVYA94DjyJioru2k9SHE%2Bqc%2Bkd9rL7yf7TUm%2BpQ05yPUM%2Bo626Pp%2BqE2q7GGfWrOpjNnWnAOPAGeAK8Bb4U5D3AJ%2BAQsAAMAHfVvl7gIrAf2Kjiz8BZYB3YC%2FwFpoGDwHfgEnA0oU7tgHiheEShyXxY%2FVn%2Fn6ljye8DcBiYAloRcV3tAdrV1xMRG%2Bo94DywCAwmx33AJHASWK7iiAjzNFOBl7WapPYtYdyo8RlLqVpOVPvq9KoH1NUuOneycaRefqnP1ftdUyiOt5KS%2BqLWdDpVzTXMl5It4Jr6u%2BQ%2FnhyBc8C7jpowGxGvmxuPqT9qyYuFIKdP71B8WT3SOKexXLrntvqxq3BefaiuFMQ0wqZftxl3M78MjBasfiDN%2FSAi0kFbtf8ACtKBWZBDoJEAAAAASUVORK5CYII%3D" alt="Add with OpenCode Studio" /></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#getting-your-session-token">Session Token</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#features">Tools</a> ·
  <a href="#troubleshooting">Troubleshooting</a> ·
  <a href="INSTALL.md">Full Install Guide</a>
</p>

---

## Quick Start

This package is a local MCP wrapper (stdio transport) that launches the upstream `perplexity-webui-scraper` MCP server via `uvx`.

By default it pins the upstream runner to:

```text
perplexity-webui-scraper[mcp]@git+https://github.com/henrique-coder/perplexity-webui-scraper.git@prod
```

Override that only if you need to test a different upstream build:

```bash
PERPLEXITY_UPSTREAM_FROM="perplexity-webui-scraper[mcp]@git+https://github.com/henrique-coder/perplexity-webui-scraper.git@<ref>" \
PERPLEXITY_SESSION_TOKEN="***" \
npx perplexity-webui-mcp
```

Manual run:

```bash
PERPLEXITY_SESSION_TOKEN="***" npx perplexity-webui-mcp
```

Manual run through a proxy:

```bash
PERPLEXITY_SESSION_TOKEN="***" \
PERPLEXITY_PROXY_URL="socks5://127.0.0.1:1080" \
npx perplexity-webui-mcp
```

Manual run with FlareSolverr:

```bash
docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest

PERPLEXITY_SESSION_TOKEN="***" \
PERPLEXITY_FLARESOLVERR_URL="http://127.0.0.1:8191" \
npx perplexity-webui-mcp
```

> **Important:** This uses Perplexity's internal WebUI API with a session cookie. For personal/local tinkering only — not affiliated with Perplexity AI.

---

### Quick Installation

Paste this into your LLM agent session:

```
Install and configure perplexity-webui-mcp by following the instructions here:
https://raw.githubusercontent.com/Microck/perplexity-webui-mcp/refs/heads/master/INSTALL.md
```

**npm (recommended)**

```bash
npm install -g perplexity-webui-mcp
```

Runtime requirement:

```bash
uv --version
```

If `uv` is missing, install it from https://docs.astral.sh/uv/getting-started/installation/

### Manual Installation

**From source**

```bash
git clone https://github.com/Microck/perplexity-webui-mcp.git
cd perplexity-webui-mcp
npm install
npm run build
```

---

## Getting Your Session Token

**Fastest method (automatic via CLI):**

```bash
uvx --with rich --from "perplexity-webui-scraper@git+https://github.com/henrique-coder/perplexity-webui-scraper.git@prod" get-perplexity-session-token
```

This interactive CLI asks for your email, handles OTP/magic-link verification, and prints the session token. You can run that command from any directory.

**Manual method (browser):**

1. Open [perplexity.ai](https://www.perplexity.ai) in your browser and log in
2. Open DevTools (F12 or Cmd+Opt+I)
3. Go to **Application** > **Cookies** > `https://www.perplexity.ai`
4. Copy the value of `__Secure-next-auth.session-token`

> Powered by token extraction flow from: https://github.com/henrique-coder/perplexity-webui-scraper

---

## Configuration

Because this server uses `stdio`, you configure it as a local command and pass the token via `env`.

### Proxy Support

- Standard proxy env vars already pass through: `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY` and their lowercase variants
- For a simpler single-value setup, set `PERPLEXITY_PROXY_URL`; the wrapper expands it into the standard proxy env vars before launching the upstream MCP server
- Optional bypass list: `PERPLEXITY_NO_PROXY`
- If Perplexity keeps returning Cloudflare challenge pages, set `PERPLEXITY_FLARESOLVERR_URL` to a running FlareSolverr instance. The wrapper solves `https://www.perplexity.ai/search/new`, injects the returned cookies into the upstream `curl_cffi` session, and stops forwarding the standard proxy env vars in that mode
- Optional FlareSolverr overrides:
  - `PERPLEXITY_FLARESOLVERR_SOLVE_URL` — alternate URL to solve first. Default: `https://www.perplexity.ai/search/new`
  - `PERPLEXITY_FLARESOLVERR_MAX_TIMEOUT` — FlareSolverr solve timeout in milliseconds. Default: `60000`

> **Note:** Deep research can take longer than 60 seconds. If your client supports it, set a higher `timeout` (example: 10 minutes).

### MCP Client Config (Claude Desktop, OpenCode, etc)

**npm installation:**

```json
{
  "mcpServers": {
    "perplexity": {
      "command": "perplexity-webui-mcp",
      "timeout": 600000,
      "env": {
        "PERPLEXITY_SESSION_TOKEN": "your_session_token_here",
        "PERPLEXITY_FLARESOLVERR_URL": "http://127.0.0.1:8191"
      }
    }
  }
}
```

**From source:**

```json
{
  "mcpServers": {
    "perplexity": {
      "command": "node",
      "args": ["/path/to/perplexity-webui-mcp/dist/index.js"],
      "timeout": 600000,
      "env": {
        "PERPLEXITY_SESSION_TOKEN": "your_session_token_here",
        "PERPLEXITY_FLARESOLVERR_URL": "http://127.0.0.1:8191"
      }
    }
  }
}
```

### Using FlareSolverr When Cloudflare Blocks Your Host

Start FlareSolverr:

```bash
docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest
curl http://127.0.0.1:8191/
```

Then point the wrapper at it:

```bash
PERPLEXITY_SESSION_TOKEN="***" \
PERPLEXITY_FLARESOLVERR_URL="http://127.0.0.1:8191" \
npx perplexity-webui-mcp
```

FlareSolverr mode:

- The wrapper solves the Cloudflare wall in FlareSolverr first, then injects the returned cookies into the upstream session
- The wrapper does **not** forward `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, or `NO_PROXY` to the upstream process in this mode because the solved cookies need to stay tied to the FlareSolverr browser route
- If FlareSolverr itself needs a proxy, configure that on the FlareSolverr side instead of on `perplexity-webui-mcp`

### Remote Deployment Over Tailscale (Optional)

If your cloud machine gets blocked by Cloudflare but your home machine works, run the upstream MCP server on the home machine and connect to it from OpenCode as a remote MCP.

1) Copy templates from this repo:
- `deploy/systemd/perplexity-webui-mcp.env.example`
- `deploy/systemd/perplexity-webui-mcp-sse.sh`
- `deploy/systemd/perplexity-webui-mcp.service`

2) Install and enable service on the home machine (user service):

```bash
mkdir -p ~/.config ~/.config/systemd/user ~/.local/bin
cp deploy/systemd/perplexity-webui-mcp.env.example ~/.config/perplexity-webui-mcp.env
cp deploy/systemd/perplexity-webui-mcp-sse.sh ~/.local/bin/perplexity-webui-mcp-sse.sh
cp deploy/systemd/perplexity-webui-mcp.service ~/.config/systemd/user/perplexity-webui-mcp.service
chmod 600 ~/.config/perplexity-webui-mcp.env
chmod 755 ~/.local/bin/perplexity-webui-mcp-sse.sh
systemctl --user daemon-reload
systemctl --user enable --now perplexity-webui-mcp.service
```

3) Point OpenCode (cloud host) to the Tailscale endpoint:

```json
{
  "mcp": {
    "perplexity-webui": {
      "type": "remote",
      "url": "http://<tailscale-ip>:8790/sse",
      "enabled": true,
      "timeout": 600000,
      "oauth": false
    }
  }
}
```

4) Verify:

```bash
opencode mcp list
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PERPLEXITY_SESSION_TOKEN` | **Yes** | Your `__Secure-next-auth.session-token` cookie value |
| `PERPLEXITY_PROXY_URL` | No | Single proxy URL expanded into `HTTP_PROXY`, `HTTPS_PROXY`, and `ALL_PROXY` |
| `PERPLEXITY_NO_PROXY` | No | Bypass list expanded into `NO_PROXY` |
| `PERPLEXITY_FLARESOLVERR_URL` | No | Base URL for a running FlareSolverr instance (e.g. `http://127.0.0.1:8191`) |
| `PERPLEXITY_FLARESOLVERR_SOLVE_URL` | No | Alternate URL to solve first. Default: `https://www.perplexity.ai/search/new` |
| `PERPLEXITY_FLARESOLVERR_MAX_TIMEOUT` | No | FlareSolverr solve timeout in ms. Default: `60000` |
| `PERPLEXITY_UPSTREAM_FROM` | No | Override the upstream pip ref. For testing only. |

---

## Features

| Tool | Description |
|------|-------------|
| `pplx_ask` | Best-model query (auto model selection) |
| `pplx_deep_research` | Deep research mode |
| `pplx_sonar` | Sonar model |
| `pplx_gpt54` / `pplx_gpt54_thinking` | GPT-5.4 variants |
| `pplx_claude_o46` / `pplx_claude_o46_think` | Claude Opus 4.6 variants |
| `pplx_claude_s46` / `pplx_claude_s46_think` | Claude Sonnet 4.6 variants |
| `pplx_gemini31_pro` / `pplx_gemini31_pro_think` | Gemini 3.1 Pro variants |
| `pplx_gemini_flash` / `pplx_gemini_flash_think` | Gemini Flash variants |
| `pplx_grok41` / `pplx_grok41_think` | Grok 4.1 variants |
| `pplx_nemotron3_super_think` | Nemotron 3 Super Thinking |

All upstream model tools support `source_focus` values: `web`, `academic`, `social`, `finance`, `all`.

---

## How This Differs from v1.0.0

- **Old v1.0.0:** One custom tool (`perplexity_search`) implemented in local TypeScript HTTP logic.
- **Current:** Delegates to upstream `perplexity-webui-scraper` MCP, exposing the full upstream model-specific toolset.
- **Result:** Significantly better compatibility with Perplexity anti-bot protections.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Token invalid / 401** | Get a fresh token from browser cookies |
| **`uvx` not found** | Install uv (`uv --version` should work) |
| **No answer returned** | Check rate limits or whether your account can access the selected model |
| **Clarifying questions error** | Deep research mode may request clarifying questions first |
| **Cloudflare challenge / `Just a moment...`** | Run FlareSolverr and set `PERPLEXITY_FLARESOLVERR_URL=http://127.0.0.1:8191` |
| **Timeout** | Deep research can take several minutes — be patient |

### Verify Both Modes Quickly

```bash
PERPLEXITY_SESSION_TOKEN="***" npm run self-test
```

This checks both:
- Regular search (`best`)
- Deep research (`deep-research`)

And prints pass/fail per mode.

---

## Project Structure

```
perplexity-webui-mcp/
├── deploy/
│   └── systemd/
│       ├── perplexity-webui-mcp.env.example
│       ├── perplexity-webui-mcp-sse.sh
│       └── perplexity-webui-mcp.service
├── src/
│   ├── index.ts          # Proxy launcher for upstream MCP
│   ├── index.test.ts     # Unit tests
│   └── self-test.ts      # Self-test runner
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── LICENSE
├── INSTALL.md
└── README.md
```

---

## License

MIT

---

## Author

[Microck](https://github.com/Microck)

---

## Acknowledgments

Special thanks to [henrique-coder/perplexity-webui-scraper](https://github.com/henrique-coder/perplexity-webui-scraper) for the WebUI reverse-engineering and token CLI workflow.
