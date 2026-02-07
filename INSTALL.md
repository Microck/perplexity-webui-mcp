# perplexity-oauth-mcp Installation Guide

## Prerequisites
- Node.js 18+
- npm or yarn

## Installation Steps

### 1. Install the package globally

```bash
npm install -g perplexity-oauth-mcp
```

Or clone and build from source:

```bash
git clone https://github.com/Microck/perplexity-oauth-mcp.git
cd perplexity-oauth-mcp
npm install
npm run build
```

### 2. Get your Perplexity session token

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
      "command": "perplexity-oauth-mcp",
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
      "args": ["/path/to/perplexity-oauth-mcp/dist/index.js"],
      "env": {
        "PERPLEXITY_SESSION_TOKEN": "YOUR_TOKEN_HERE"
      }
    }
  }
}
```

### 4. Restart your MCP client

Restart Claude Desktop, OpenCode, or whichever MCP client you're using.

### 5. Test it

Ask your AI assistant to search something using Perplexity:

> "Use perplexity to search for the latest news about AI"

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Token invalid / 401 | Get a fresh token from browser cookies |
| Command not found | Run `npm install -g perplexity-oauth-mcp` again |
| No answer returned | Check if Perplexity is blocking requests (rate limits) |
| Timeout | Deep research can take several minutes - be patient |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PERPLEXITY_SESSION_TOKEN` | Yes | Your `__Secure-next-auth.session-token` cookie value |
