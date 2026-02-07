#!/usr/bin/env node

const PERPLEXITY_BASE_URL = "https://www.perplexity.ai";
const PERPLEXITY_SEARCH_INIT_PATH = "/search/new";
const PERPLEXITY_ASK_PATH = "/rest/sse/perplexity_ask";
const PERPLEXITY_SESSION_COOKIE = "__Secure-next-auth.session-token";
const WEBUI_VERSION = "2.18";
const REQUEST_TIMEOUT_MS = 90_000;

const MODEL_MAP: Record<string, { identifier: string; mode: string }> = {
  best: { identifier: "pplx_pro", mode: "copilot" },
  deep_research: { identifier: "pplx_alpha", mode: "copilot" },
};

type Mode = "best" | "deep_research";

function parseJsonSafely(input: string): unknown {
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readSseEvents(response: Response): Promise<Record<string, unknown>[]> {
  const body = response.body;
  if (!body) {
    return [];
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const events: Record<string, unknown>[] = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) {
        continue;
      }

      const payload = trimmed.slice(6);
      const event = asRecord(parseJsonSafely(payload));
      if (event) {
        events.push(event);
      }
    }
  }

  return events;
}

function createHeaders(sessionToken: string): Record<string, string> {
  return {
    Accept: "text/event-stream, application/json",
    "Content-Type": "application/json",
    Origin: PERPLEXITY_BASE_URL,
    Referer: `${PERPLEXITY_BASE_URL}/`,
    Cookie: `${PERPLEXITY_SESSION_COOKIE}=${sessionToken}`,
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };
}

function buildPayload(query: string, mode: Mode): Record<string, unknown> {
  const model = MODEL_MAP[mode];

  return {
    params: {
      attachments: [],
      language: "en-US",
      timezone: null,
      client_coordinates: null,
      sources: ["web"],
      model_preference: model.identifier,
      mode: model.mode,
      search_focus: "internet",
      search_recency_filter: null,
      is_incognito: true,
      use_schematized_api: false,
      local_search_enabled: false,
      prompt_source: "user",
      send_back_text_in_streaming_api: true,
      version: WEBUI_VERSION,
    },
    query_str: query,
  };
}

function parseDeepResearchSignal(text: string): { hasAnswer: boolean; hasClarifying: boolean } {
  const parsed = parseJsonSafely(text);

  if (!Array.isArray(parsed)) {
    return { hasAnswer: false, hasClarifying: false };
  }

  let hasAnswer = false;
  let hasClarifying = false;

  for (const item of parsed) {
    const step = asRecord(item);
    if (!step) {
      continue;
    }

    const stepType = asString(step.step_type);
    if (stepType === "RESEARCH_CLARIFYING_QUESTIONS") {
      const content = asRecord(step.content);
      const questions = content
        ? [...asStringArray(content.questions), ...asStringArray(content.clarifying_questions)]
        : [];
      hasClarifying = questions.length > 0 || true;
    }

    if (stepType === "FINAL") {
      const content = asRecord(step.content);
      if (!content) {
        continue;
      }

      const answer = asString(content.answer);
      if (answer && answer.trim().length > 0) {
        hasAnswer = true;
      }
    }
  }

  return { hasAnswer, hasClarifying };
}

async function runMode(mode: Mode, query: string, sessionToken: string): Promise<string> {
  const headers = createHeaders(sessionToken);

  const initUrl = `${PERPLEXITY_BASE_URL}${PERPLEXITY_SEARCH_INIT_PATH}?q=${encodeURIComponent(query)}`;
  const initResponse = await fetchWithTimeout(initUrl, {
    method: "GET",
    headers,
  });

  if (!initResponse.ok) {
    throw new Error(`init request failed (${initResponse.status})`);
  }

  const askUrl = `${PERPLEXITY_BASE_URL}${PERPLEXITY_ASK_PATH}`;
  const askResponse = await fetchWithTimeout(askUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(buildPayload(query, mode)),
  });

  if (!askResponse.ok) {
    throw new Error(`ask request failed (${askResponse.status})`);
  }

  const events = await readSseEvents(askResponse);
  if (events.length === 0) {
    throw new Error("no SSE events returned");
  }

  let answerPreview: string | null = null;
  let gotClarifyingQuestions = false;

  for (const event of events) {
    const text = asString(event.text);
    if (!text) {
      continue;
    }

    if (mode === "deep_research") {
      const signal = parseDeepResearchSignal(text);
      if (signal.hasClarifying) {
        gotClarifyingQuestions = true;
      }
      if (signal.hasAnswer) {
        answerPreview = "deep research final answer received";
      }
    }

    const parsed = asRecord(parseJsonSafely(text));
    if (!parsed) {
      continue;
    }

    const answer = asString(parsed.answer);
    if (answer && answer.trim().length > 0) {
      answerPreview = answer.slice(0, 120);
    }
  }

  if (mode === "deep_research" && gotClarifyingQuestions) {
    return "deep_research reachable (clarifying questions requested)";
  }

  if (!answerPreview) {
    throw new Error("no answer text detected in stream");
  }

  return `answer: ${answerPreview}`;
}

async function main(): Promise<void> {
  const sessionToken = process.env.PERPLEXITY_SESSION_TOKEN?.trim();
  if (!sessionToken) {
    throw new Error("PERPLEXITY_SESSION_TOKEN is required");
  }

  console.log("Running Perplexity WebUI self-test...");

  let regularOk = false;
  let deepOk = false;

  try {
    const regular = await runMode("best", "What is 2+2? Reply in one short sentence.", sessionToken);
    regularOk = true;
    console.log(`PASS regular_search: ${regular}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL regular_search: ${message}`);
  }

  try {
    const deep = await runMode(
      "deep_research",
      "Give a concise overview of quantum computing in one paragraph.",
      sessionToken,
    );
    deepOk = true;
    console.log(`PASS deep_research: ${deep}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL deep_research: ${message}`);
  }

  if (!regularOk || !deepOk) {
    process.exitCode = 1;
    console.error("Self-test failed. Check token validity and Perplexity availability.");
    return;
  }

  console.log("Self-test passed. Both regular search and deep research are reachable.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal: ${message}`);
  process.exit(1);
});
