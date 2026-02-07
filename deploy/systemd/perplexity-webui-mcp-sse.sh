#!/usr/bin/env bash
set -euo pipefail

exec "$HOME/.local/bin/uv" run --with "perplexity-webui-scraper[mcp]" python -c "from perplexity_webui_scraper.mcp.server import mcp; mcp.run(transport='sse', host='0.0.0.0', port=8790, show_banner=False)"
