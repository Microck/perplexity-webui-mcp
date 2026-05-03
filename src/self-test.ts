#!/usr/bin/env node

import childProcess from "node:child_process";

import { buildFlareSolverrPythonBootstrap } from "./index.js";

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

const UPSTREAM_FROM =
  process.env.PERPLEXITY_UPSTREAM_FROM ??
  "perplexity-webui-scraper[mcp]@git+https://github.com/henrique-coder/perplexity-webui-scraper.git@prod";

function fail(message: string): never {
  console.error(`perplexity-webui-mcp self-test: ${message}`);
  process.exit(1);
}

function parseResult(stdout: string, stderr: string): TestResult {
  const output = stdout.trim();
  if (!output) {
    const detail = stderr.trim();
    fail(
      detail
        ? `no output from Python self-test runner\n${detail}`
        : "no output from Python self-test runner",
    );
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

from perplexity_webui_scraper import (
  CitationMode,
  ConversationConfig,
  Perplexity,
  ResearchClarifyingQuestionsError,
  SearchFocus,
  SourceFocus,
)

${buildFlareSolverrPythonBootstrap()}

maybe_enable_flaresolverr()

token = os.environ.get("PERPLEXITY_SESSION_TOKEN", "").strip()
result = {
  "regular": {"ok": False},
  "deep_research": {"ok": False},
}


def build_auto_clarification_reply(questions):
  question_lines = [f"- {question}" for question in questions] or ["- No clarification details were provided."]

  return "\n".join([
    "Proceed with the research now.",
    "For every clarification question, choose the recommended option when one is marked; otherwise choose the first listed option.",
    "Do not ask follow-up clarification questions.",
    "Clarification questions returned by Perplexity:",
    *question_lines,
  ])

if not token:
  result["regular"] = {"ok": False, "error": "missing token"}
  result["deep_research"] = {"ok": False, "error": "missing token"}
  print(json.dumps(result))
  raise SystemExit(0)

client = Perplexity(token)

try:
  regular = client.create_conversation(
    ConversationConfig(
      model="best",
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
      model="deep-research",
      citation_mode=CitationMode.CLEAN,
      search_focus=SearchFocus.WEB,
      source_focus=[SourceFocus.WEB],
    )
  )
  try:
    deep.ask("Give a concise one-paragraph overview of quantum computing.")
  except ResearchClarifyingQuestionsError as error:
    deep.ask(build_auto_clarification_reply(error.questions))

  answer = (deep.answer or "").strip()
  if answer:
    result["deep_research"] = {
      "ok": True,
      "status": "answer",
      "preview": answer[:120],
    }
  else:
    result["deep_research"] = {"ok": False, "error": "empty answer"}
except Exception as error:
  result["deep_research"] = {"ok": False, "error": str(error)}

client.close()
print(json.dumps(result))
`;

  const run = childProcess.spawnSync(
    "uvx",
    [
      "--from",
      UPSTREAM_FROM,
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
        "`uvx` was not found. Install uv first: https://docs.astral.sh/uv/getting-started/installation/",
      );
    }

    fail(`unable to execute uvx runner: ${String(run.error)}`);
  }

  const parsed = parseResult(run.stdout ?? "", run.stderr ?? "");

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

  if (run.stderr?.trim()) {
    console.error((run.stderr ?? "").trim());
  }

  if (!regular.ok || !deep.ok) {
    process.exit(1);
  }
}

main();
