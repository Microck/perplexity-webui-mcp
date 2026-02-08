

<h1 align="">perplexity-webui-mcp</h1>

<p align="">
  mcp server for querying perplexity pro via webui session token.
</p>

<p align="">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
  <img src="https://img.shields.io/badge/language-typescript-blue" alt="language">
  <img src="https://img.shields.io/badge/npm-perplexity--webui--mcp-orange" alt="npm">
  <img src="https://img.shields.io/badge/mcp-sdk-orange" alt="mcp">
  <a href="https://github.com/Microck/opencode-studio"><img src="https://img.shields.io/badge/opencode-studio-brown?logo=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAABiElEQVR4nF2Sv0tWcRTGPyeVIpCWwmyJGqQagsqCsL2hhobsD3BvdWhoj%2F6CiIKaoqXBdMjKRWwQgqZ%2BokSvkIhg9BOT9xPn9Vx79cD3cu6953zP8zznCQB1V0S01d3AKeAKcBVYA94DjyJioru2k9SHE%2Bqc%2Bkd9rL7yf7TUm%2BpQ05yPUM%2Bo626Pp%2BqE2q7GGfWrOpjNnWnAOPAGeAK8Bb4U5D3AJ%2BAQsAAMAHfVvl7gIrAf2Kjiz8BZYB3YC%2FwFpoGDwHfgEnA0oU7tgHiheEShyXxY%2FVn%2Fn6ljye8DcBiYAloRcV3tAdrV1xMRG%2Bo94DywCAwmx33AJHASWK7iiAjzNFOBl7WapPYtYdyo8RlLqVpOVPvq9KoH1NUuOneycaRefqnP1ftdUyiOt5KS%2BqLWdDpVzTXMl5It4Jr6u%2BQ%2FnhyBc8C7jpowGxGvmxuPqT9qyYuFIKdP71B8WT3SOKexXLrntvqxq3BefaiuFMQ0wqZftxl3M78MjBasfiDN%2FSAi0kFbtf8ACtKBWZBDoJEAAAAASUVORK5CYII%3D" alt="Add with OpenCode Studio" /></a>
</p>

---

## quick start

this package is a local mcp wrapper (stdio transport) that launches the upstream `perplexity-webui-scraper` mcp server via `uvx`.

manual run:

```bash
PERPLEXITY_SESSION_TOKEN="your_token_here" npx perplexity-webui-mcp
```

> **important:** this uses perplexity's internal webui api with a session cookie. for personal/local tinkering only - not affiliated with perplexity ai.

---

### overview

perplexity-webui-mcp is a local stdio MCP wrapper that launches the upstream `perplexity-webui-scraper` MCP server through `uvx`. this keeps your package on npm while using the upstream battle-tested WebUI implementation (browser impersonation, retry logic, model-specific tools, and token CLI ecosystem).

---

### quick installation

paste this into your llm agent session:

```
Install and configure perplexity-webui-mcp by following the instructions here:
https://raw.githubusercontent.com/Microck/perplexity-webui-mcp/refs/heads/master/INSTALL.md
```

**npm (recommended)**

```bash
npm install -g perplexity-webui-mcp
```

runtime requirement:

```bash
uv --version
```

if `uv` is missing, install it from https://docs.astral.sh/uv/getting-started/installation/

---

### manual installation

**from source**

```bash
git clone https://github.com/Microck/perplexity-webui-mcp.git
cd perplexity-webui-mcp
npm install
npm run build
```

---

### getting your session token

**fastest method (automatic via CLI):**

```bash
uvx --with rich --from "perplexity-webui-scraper@latest" get-perplexity-session-token
```

this interactive CLI asks for your email, handles OTP/magic-link verification, and prints the session token.

you can run that command from any directory.

**manual method (browser):**

1. open [perplexity.ai](https://www.perplexity.ai) in your browser and log in
2. open devtools (f12 or cmd+opt+i)
3. go to **application** > **cookies** > `https://www.perplexity.ai`
4. copy the value of `__Secure-next-auth.session-token`

> powered by token extraction flow from: https://github.com/henrique-coder/perplexity-webui-scraper

---

### configuration

because this server uses `stdio`, you configure it as a local command and pass the token via `env`.

note: deep research can take longer than 60 seconds. if your client supports it, set a higher `timeout` (example: 10 minutes).

**mcp client config (claude desktop, opencode, etc)**

```json
{
  "mcpServers": {
    "perplexity": {
      "command": "perplexity-webui-mcp",
      "timeout": 600000,
      "env": {
        "PERPLEXITY_SESSION_TOKEN": "your_session_token_here"
      }
    }
  }
}
```

**from source**

```json
{
  "mcpServers": {
    "perplexity": {
      "command": "node",
      "args": ["/path/to/perplexity-webui-mcp/dist/index.js"],
      "timeout": 600000,
      "env": {
        "PERPLEXITY_SESSION_TOKEN": "your_session_token_here"
      }
    }
  }
}
```

### remote deployment over tailscale (optional)

if your cloud machine gets blocked by cloudflare but your home machine works, run the upstream mcp server on the home machine and connect to it from opencode as a remote mcp.

1) copy templates from this repo:
- `deploy/systemd/perplexity-webui-mcp.env.example`
- `deploy/systemd/perplexity-webui-mcp-sse.sh`
- `deploy/systemd/perplexity-webui-mcp.service`

2) install and enable service on the home machine (user service):

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

3) point opencode (cloud host) to the tailscale endpoint:

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

4) verify:

```bash
opencode mcp list
```

---

### features

| tool | description |
|------|-------------|
| `pplx_ask` | best-model query (auto model selection) |
| `pplx_deep_research` | deep research mode |
| `pplx_sonar` | sonar model |
| `pplx_gpt52` / `pplx_gpt52_thinking` | gpt-5.2 variants |
| `pplx_claude_sonnet` / `pplx_claude_sonnet_think` | claude sonnet 4.5 variants |
| `pplx_gemini_flash` / `pplx_gemini_flash_think` / `pplx_gemini_pro_think` | gemini 3 variants |
| `pplx_grok` / `pplx_grok_thinking` | grok 4.1 variants |
| `pplx_kimi_thinking` | kimi k2.5 thinking |

all upstream model tools support `source_focus` values: `web`, `academic`, `social`, `finance`, `all`.

### how this differs from v1.0.0

- old v1.0.0: one custom tool (`perplexity_search`) implemented in local TypeScript HTTP logic.
- current: delegates to upstream `perplexity-webui-scraper` MCP, exposing the full upstream model-specific toolset.
- result: significantly better compatibility with Perplexity anti-bot protections.

---

### troubleshooting

| problem | solution |
|---------|----------|
| **token invalid / 401** | get a fresh token from browser cookies |
| **`uvx` not found** | install uv (`uv --version` should work) |
| **no answer returned** | check rate limits or whether your account can access the selected model |
| **clarifying questions error** | deep research mode may request clarifying questions first |
| **timeout** | deep research can take several minutes - be patient |

### verify both modes quickly

```bash
PERPLEXITY_SESSION_TOKEN="your_token_here" npm run self-test
```

this checks both:
- regular search (`best`)
- deep research (`deep_research`)

and prints pass/fail per mode.

---

### project structure

```
perplexity-webui-mcp/
├── deploy/
│   └── systemd/
│       ├── perplexity-webui-mcp.env.example
│       ├── perplexity-webui-mcp-sse.sh
│       └── perplexity-webui-mcp.service
├── src/
│   └── index.ts      # proxy launcher for upstream MCP
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── LICENSE
├── INSTALL.md
└── README.md
```

---

### license

mit

---

### author

[Microck](https://github.com/Microck)

---

### shoutout

special thanks to [henrique-coder/perplexity-webui-scraper](https://github.com/henrique-coder/perplexity-webui-scraper) for the WebUI reverse-engineering and token CLI workflow that helped this project.
