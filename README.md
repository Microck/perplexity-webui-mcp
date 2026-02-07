

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

this is a local mcp server (stdio transport). your mcp client spawns it as a process, and you provide the session token via the client's `env` config. so kinda like an oauth flow.

manual run:

```bash
PERPLEXITY_SESSION_TOKEN="your_token_here" npx perplexity-webui-mcp
```

> **important:** this uses perplexity's internal webui api with a session cookie. for personal/local tinkering only - not affiliated with perplexity ai.

---

### overview

perplexity-webui-mcp lets your ai assistant (claude, opencode, etc) query perplexity pro using your logged-in session. it supports all perplexity pro models including deep research, gpt-5.2, claude 4.5, gemini 3, grok 4.1, and more.

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

**mcp client config (claude desktop, opencode, etc)**

```json
{
  "mcpServers": {
    "perplexity": {
      "command": "perplexity-webui-mcp",
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
      "env": {
        "PERPLEXITY_SESSION_TOKEN": "your_session_token_here"
      }
    }
  }
}
```

---

### features

| tool | description |
|------|-------------|
| **perplexity_search** | query perplexity with full model selection, source filters, and follow-up support |

### supported models

| model | identifier |
|-------|------------|
| best (default) | `best` |
| deep research | `deep_research` |
| sonar | `sonar` |
| gpt-5.2 | `gpt_52` |
| gpt-5.2 thinking | `gpt_52_thinking` |
| claude 4.5 sonnet | `claude_45_sonnet` |
| claude 4.5 sonnet thinking | `claude_45_sonnet_thinking` |
| claude 4.5 opus | `claude_45_opus` |
| claude 4.5 opus thinking | `claude_45_opus_thinking` |
| gemini 3 flash | `gemini_3_flash` |
| gemini 3 flash thinking | `gemini_3_flash_thinking` |
| gemini 3 pro thinking | `gemini_3_pro_thinking` |
| grok 4.1 | `grok_41` |
| grok 4.1 thinking | `grok_41_thinking` |
| kimi k2.5 thinking | `kimi_k25_thinking` |

### tool parameters

| parameter | type | default | description |
|-----------|------|---------|-------------|
| `query` | string | required | the question to ask perplexity |
| `model` | enum | `best` | model preset to use |
| `sourceFocus` | array | `["web"]` | source types: web, academic, social, finance |
| `searchFocus` | enum | `web` | search mode: web or writing |
| `timeRange` | enum | `all` | recency filter: all, today, week, month, year |
| `language` | string | `en-US` | response language (ietf format) |
| `citationMode` | enum | `clean` | citation format: default, markdown, clean |
| `saveToLibrary` | boolean | `false` | save query to your perplexity library |
| `conversationUuid` | string | - | uuid for follow-up questions |
| `readWriteToken` | string | - | token for follow-ups (from previous response) |

---

### troubleshooting

| problem | solution |
|---------|----------|
| **token invalid / 401** | get a fresh token from browser cookies |
| **no answer returned** | check if perplexity is blocking requests (rate limits) |
| **clarifying questions error** | deep research mode needs clarifying answers - use a simpler model |
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
├── src/
│   └── index.ts      # main server + tool implementation
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
