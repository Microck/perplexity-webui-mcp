# perplexity-webui-mcp Installation Guide

## Prerequisites
- Node.js 18+
- npm or yarn
- uv / uvx (https://docs.astral.sh/uv/getting-started/installation/)

This package defaults to the pinned upstream MCP runner:

```text
perplexity-webui-scraper[mcp]@git+https://github.com/henrique-coder/perplexity-webui-scraper.git@prod
```

## Installation Steps

### 1. Install the package globally

```bash
npm install -g perplexity-webui-mcp
```

Or clone and build from source:

```bash
git clone https://github.com/Microck/perplexity-webui-mcp.git
cd perplexity-webui-mcp
npm install
npm run build
```

### 2. Get your Perplexity session token

**Fastest (automatic CLI):**

```bash
uvx --with rich --from "perplexity-webui-scraper@git+https://github.com/henrique-coder/perplexity-webui-scraper.git@prod" get-perplexity-session-token
```

This interactive tool asks for your email, handles verification, and prints your token.

You can run this command from any directory.

**Manual (browser):**

1. Open [perplexity.ai](https://www.perplexity.ai) in your browser and log in
2. Open DevTools (F12 or Cmd+Opt+I)
3. Go to **Application** > **Cookies** > `https://www.perplexity.ai`
4. Copy the value of `__Secure-next-auth.session-token`

### 3. Configure your MCP client

Add this to your MCP client configuration (e.g., `claude_desktop_config.json`, `mcp.json`, or equivalent):

Proxy note:
- if you already use standard proxy env vars such as `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, or `NO_PROXY`, the wrapper forwards them to the upstream process
- if you want one wrapper-specific knob, set `PERPLEXITY_PROXY_URL`; it is expanded into the standard proxy env vars before the upstream MCP server starts
- use `PERPLEXITY_NO_PROXY` for bypass hosts
- if your host gets stuck on Cloudflare challenge pages, run FlareSolverr and set `PERPLEXITY_FLARESOLVERR_URL`; the wrapper will solve `https://www.perplexity.ai/search/new` first and inject the resulting cookies into the upstream session
- optional FlareSolverr overrides:
  - `PERPLEXITY_FLARESOLVERR_SOLVE_URL` - alternate URL to solve first. default: `https://www.perplexity.ai/search/new`
  - `PERPLEXITY_FLARESOLVERR_MAX_TIMEOUT` - FlareSolverr solve timeout in milliseconds. default: `60000`

**If installed via npm:**

```json
{
  "mcpServers": {
    "perplexity": {
      "command": "perplexity-webui-mcp",
      "timeout": 600000,
      "env": {
        "PERPLEXITY_SESSION_TOKEN": "YOUR_TOKEN_HERE",
        "PERPLEXITY_FLARESOLVERR_URL": "http://127.0.0.1:8191"
      }
    }
  }
}
```

**If installed from source:**

```json
{
  "mcpServers": {
    "perplexity": {
      "command": "node",
      "args": ["/path/to/perplexity-webui-mcp/dist/index.js"],
      "timeout": 600000,
      "env": {
        "PERPLEXITY_SESSION_TOKEN": "YOUR_TOKEN_HERE",
        "PERPLEXITY_FLARESOLVERR_URL": "http://127.0.0.1:8191"
      }
    }
  }
}
```

### Optional: use FlareSolverr for Cloudflare-challenged hosts

Start FlareSolverr locally:

```bash
docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest
curl http://127.0.0.1:8191/
```

Then point the wrapper at it:

```json
{
  "mcpServers": {
    "perplexity": {
      "command": "perplexity-webui-mcp",
      "timeout": 600000,
      "env": {
        "PERPLEXITY_SESSION_TOKEN": "YOUR_TOKEN_HERE",
        "PERPLEXITY_FLARESOLVERR_URL": "http://127.0.0.1:8191"
      }
    }
  }
}
```

In this mode the wrapper does not forward `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, or `NO_PROXY` to the upstream process. The solved cookies need to stay tied to the FlareSolverr browser route.

### 4. Restart your MCP client

Restart Claude Desktop, OpenCode, or whichever MCP client you're using.

### Optional: host remotely over Tailscale + systemd

Use this when your cloud host gets Cloudflare 403 but your home machine works.

1) On the home machine, copy templates from this repo:
- `deploy/systemd/perplexity-webui-mcp.env.example` -> `~/.config/perplexity-webui-mcp.env`
- `deploy/systemd/perplexity-webui-mcp-sse.sh` -> `~/.local/bin/perplexity-webui-mcp-sse.sh`
- `deploy/systemd/perplexity-webui-mcp.service` -> `~/.config/systemd/user/perplexity-webui-mcp.service`

2) Enable service:

```bash
chmod 600 ~/.config/perplexity-webui-mcp.env
chmod 755 ~/.local/bin/perplexity-webui-mcp-sse.sh
systemctl --user daemon-reload
systemctl --user enable --now perplexity-webui-mcp.service
```

3) On the cloud machine, configure remote MCP URL:

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

### 5. Test it

Ask your AI assistant to call an upstream tool (example):

> "Use `pplx_ask` to search for the latest news about AI"

Or run the built-in mode test directly:

```bash
PERPLEXITY_SESSION_TOKEN="YOUR_TOKEN_HERE" npm run self-test
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Token invalid / 401 | Get a fresh token from browser cookies |
| Command not found | Run `npm install -g perplexity-webui-mcp` again |
| `uvx` not found | Install uv and ensure `uvx --version` works |
| No answer returned | Check rate limits or whether your account can access selected model |
| Cloudflare challenge / `Just a moment...` | Run FlareSolverr and set `PERPLEXITY_FLARESOLVERR_URL=http://127.0.0.1:8191` |
| Timeout | Deep research can take several minutes - be patient |

## Acknowledgment

This project was built with help from:
- https://github.com/henrique-coder/perplexity-webui-scraper

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PERPLEXITY_SESSION_TOKEN` | Yes | Your `__Secure-next-auth.session-token` cookie value |
| `PERPLEXITY_PROXY_URL` | No | Single proxy URL expanded into `HTTP_PROXY`, `HTTPS_PROXY`, and `ALL_PROXY` for the upstream process |
| `PERPLEXITY_NO_PROXY` | No | Optional bypass list expanded into `NO_PROXY` |
| `PERPLEXITY_FLARESOLVERR_URL` | No | Base URL for a running FlareSolverr instance, for example `http://127.0.0.1:8191` |
| `PERPLEXITY_FLARESOLVERR_SOLVE_URL` | No | Alternate Perplexity URL to solve before the upstream client starts. default: `https://www.perplexity.ai/search/new` |
| `PERPLEXITY_FLARESOLVERR_MAX_TIMEOUT` | No | FlareSolverr solve timeout in milliseconds. default: `60000` |
