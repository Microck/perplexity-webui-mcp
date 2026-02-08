# perplexity-webui-mcp Installation Guide

## Prerequisites
- Node.js 18+
- npm or yarn
- uv / uvx (https://docs.astral.sh/uv/getting-started/installation/)

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
uvx --with rich --from "perplexity-webui-scraper@latest" get-perplexity-session-token
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

**If installed via npm:**

```json
{
  "mcpServers": {
    "perplexity": {
      "command": "perplexity-webui-mcp",
      "timeout": 600000,
      "env": {
        "PERPLEXITY_SESSION_TOKEN": "YOUR_TOKEN_HERE"
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
        "PERPLEXITY_SESSION_TOKEN": "YOUR_TOKEN_HERE"
      }
    }
  }
}
```

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
| Timeout | Deep research can take several minutes - be patient |

## Acknowledgment

This project was built with help from:
- https://github.com/henrique-coder/perplexity-webui-scraper

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PERPLEXITY_SESSION_TOKEN` | Yes | Your `__Secure-next-auth.session-token` cookie value |
