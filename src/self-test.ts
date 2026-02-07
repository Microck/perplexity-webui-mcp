#!/usr/bin/env node

import { spawnSync } from "node:child_process";

type ModeResult = {
  ok: boolean;
  status?: string;
  preview?: string;
  error?: string;
};

type TestResult = {
  regular: ModeResult;
  deep_research: ModeResult;
};

function fail(message: string): never {
  console.error(`perplexity-webui-mcp self-test: ${message}`);
  process.exit(1);
}

function parseResult(stdout: string): TestResult {
  const output = stdout.trim();
  if (!output) {
    fail("no output from Python self-test runner");
  }

  const lastLine = output.split("\n").pop();
  if (!lastLine) {
    fail("missing JSON payload from Python self-test runner");
  }

  try {
    return JSON.parse(lastLine) as TestResult;
  } catch {
    fail(`failed to parse JSON output: ${lastLine}`);
  }
}

function main(): void {
  const token = process.env.PERPLEXITY_SESSION_TOKEN?.trim();
  if (!token) {
    fail("PERPLEXITY_SESSION_TOKEN is required");
  }

  const pythonScript = String.raw`
import json
import os

from perplexity_webui_scraper import ConversationConfig, Models, Perplexity
from perplexity_webui_scraper.enums import CitationMode, SearchFocus, SourceFocus
from perplexity_webui_scraper.exceptions import ResearchClarifyingQuestionsError

token = os.environ.get("PERPLEXITY_SESSION_TOKEN", "").strip()
result = {
  "regular": {"ok": False},
  "deep_research": {"ok": False},
}

if not token:
  result["regular"] = {"ok": False, "error": "missing token"}
  result["deep_research"] = {"ok": False, "error": "missing token"}
  print(json.dumps(result))
  raise SystemExit(0)

client = Perplexity(token)

try:
  regular = client.create_conversation(
    ConversationConfig(
      model=Models.BEST,
      citation_mode=CitationMode.CLEAN,
      search_focus=SearchFocus.WEB,
      source_focus=[SourceFocus.WEB],
    )
  )
  regular.ask("What is 2+2? Reply with one short sentence.")
  answer = (regular.answer or "").strip()
  if answer:
    result["regular"] = {
      "ok": True,
      "status": "answer",
      "preview": answer[:120],
    }
  else:
    result["regular"] = {"ok": False, "error": "empty answer"}
except Exception as error:
  result["regular"] = {"ok": False, "error": str(error)}

try:
  deep = client.create_conversation(
    ConversationConfig(
      model=Models.DEEP_RESEARCH,
      citation_mode=CitationMode.CLEAN,
      search_focus=SearchFocus.WEB,
      source_focus=[SourceFocus.WEB],
    )
  )
  deep.ask("Give a concise one-paragraph overview of quantum computing.")
  answer = (deep.answer or "").strip()
  if answer:
    result["deep_research"] = {
      "ok": True,
      "status": "answer",
      "preview": answer[:120],
    }
  else:
    result["deep_research"] = {"ok": False, "error": "empty answer"}
except ResearchClarifyingQuestionsError as error:
  result["deep_research"] = {
    "ok": True,
    "status": "clarifying_questions",
    "preview": str(error)[:120],
  }
except Exception as error:
  result["deep_research"] = {"ok": False, "error": str(error)}

client.close()
print(json.dumps(result))
`;

  const run = spawnSync(
    "uv",
    [
      "run",
      "--with",
      "perplexity-webui-scraper",
      "python",
      "-c",
      pythonScript,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PERPLEXITY_SESSION_TOKEN: token,
      },
      timeout: 240_000,
    },
  );

  if (run.error) {
    if ((run.error as NodeJS.ErrnoException).code === "ENOENT") {
      fail(
        "`uv` was not found. Install uv first: https://docs.astral.sh/uv/getting-started/installation/",
      );
    }

    fail(`unable to execute uv runner: ${String(run.error)}`);
  }

  const parsed = parseResult(run.stdout ?? "");

  const regular = parsed.regular;
  const deep = parsed.deep_research;

  if (regular.ok) {
    console.log(`PASS regular_search (${regular.status ?? "ok"}): ${regular.preview ?? ""}`);
  } else {
    console.error(`FAIL regular_search: ${regular.error ?? "unknown error"}`);
  }

  if (deep.ok) {
    console.log(`PASS deep_research (${deep.status ?? "ok"}): ${deep.preview ?? ""}`);
  } else {
    console.error(`FAIL deep_research: ${deep.error ?? "unknown error"}`);
  }

  if (run.status !== 0 && run.status !== null) {
    console.error((run.stderr ?? "").trim());
  }

  if (!regular.ok || !deep.ok) {
    process.exit(1);
  }
}

main();
