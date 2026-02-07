#!/usr/bin/env node
/**
 * Perplexity MCP Server
 *
 * Queries Perplexity Pro via WebUI session token.
 * For personal/local use only - not affiliated with Perplexity AI.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const PERPLEXITY_BASE_URL = "https://www.perplexity.ai";
const PERPLEXITY_SEARCH_INIT_PATH = "/search/new";
const PERPLEXITY_ASK_PATH = "/rest/sse/perplexity_ask";
const PERPLEXITY_SESSION_COOKIE = "__Secure-next-auth.session-token";
const WEBUI_VERSION = "2.18";
const REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

const MODEL_MAP: Record<string, { identifier: string; mode: string }> = {
  best: { identifier: "pplx_pro", mode: "copilot" },
  deep_research: { identifier: "pplx_alpha", mode: "copilot" },
  sonar: { identifier: "experimental", mode: "copilot" },
  gpt_52: { identifier: "gpt52", mode: "copilot" },
  gpt_52_thinking: { identifier: "gpt52_thinking", mode: "copilot" },
  claude_45_sonnet: { identifier: "claude45sonnet", mode: "copilot" },
  claude_45_sonnet_thinking: { identifier: "claude45sonnet_thinking", mode: "copilot" },
  claude_45_opus: { identifier: "claude45opus", mode: "copilot" },
  claude_45_opus_thinking: { identifier: "claude45opus_thinking", mode: "copilot" },
  gemini_3_flash: { identifier: "gemini30flash", mode: "copilot" },
  gemini_3_flash_thinking: { identifier: "gemini30flash_high", mode: "copilot" },
  gemini_3_pro_thinking: { identifier: "gemini30pro", mode: "copilot" },
  grok_41: { identifier: "grok4", mode: "copilot" },
  grok_41_thinking: { identifier: "grok4_thinking", mode: "copilot" },
  kimi_k25_thinking: { identifier: "kimi_k2_5", mode: "copilot" },
};

const SOURCE_FOCUS_MAP: Record<string, string> = {
  web: "web",
  academic: "scholar",
  social: "social",
  finance: "edgar",
};

const SEARCH_FOCUS_MAP: Record<string, string> = {
  web: "internet",
  writing: "writing",
};

const TIME_RANGE_MAP: Record<string, string | null> = {
  all: null,
  today: "DAY",
  week: "WEEK",
  month: "MONTH",
  year: "YEAR",
};

type SearchResult = {
  title: string | null;
  snippet: string | null;
  url: string | null;
};

type StreamState = {
  title: string | null;
  conversationUuid: string | null;
  readWriteToken: string | null;
  answer: string | null;
  chunks: string[];
  searchResults: SearchResult[];
};

function parseJsonSafely(input: string): unknown {
  try {
    return JSON.parse(input);
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
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function formatCitations(
  text: string,
  mode: string,
  searchResults: SearchResult[]
): string {
  if (mode === "default") return text;

  return text.replace(/\[(\d{1,2})\]/g, (full: string, group: string) => {
    if (mode === "clean") return "";
    const index = Number.parseInt(group, 10) - 1;
    const result = searchResults[index];
    const url = result?.url ?? null;
    if (!url) return full;
    return `[${group}](${url})`;
  });
}

async function readSseEvents(
  response: Response
): Promise<Record<string, unknown>[]> {
  const body = response.body;
  if (!body) return [];

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const events: Record<string, unknown>[] = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;

      const payload = trimmed.slice(6);
      const parsed = parseJsonSafely(payload);
      const event = asRecord(parsed);
      if (event) events.push(event);
    }
  }

  return events;
}

function normalizeSearchResults(value: unknown): SearchResult[] {
  if (!Array.isArray(value)) return [];

  const normalized: SearchResult[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;
    normalized.push({
      title: asString(record.name),
      snippet: asString(record.snippet),
      url: asString(record.url),
    });
  }
  return normalized;
}

function extractClarifyingQuestions(content: unknown): string[] {
  const contentRecord = asRecord(content);
  if (contentRecord) {
    const questions = asStringArray(contentRecord.questions);
    if (questions.length > 0) return questions;

    const clarifyingQuestions = asStringArray(contentRecord.clarifying_questions);
    if (clarifyingQuestions.length > 0) return clarifyingQuestions;

    return Object.values(contentRecord)
      .filter((value): value is string => typeof value === "string")
      .filter((value) => value.includes("?"));
  }

  if (Array.isArray(content)) {
    return content.filter((value): value is string => typeof value === "string");
  }

  return typeof content === "string" ? [content] : [];
}

function updateStateFromAnswerData(
  state: StreamState,
  answerData: Record<string, unknown>,
  citationMode: string
): void {
  const results = normalizeSearchResults(answerData.web_results);
  if (results.length > 0) state.searchResults = results;

  const rawAnswer = asString(answerData.answer);
  if (rawAnswer) {
    state.answer = formatCitations(rawAnswer, citationMode, state.searchResults);
  }

  const rawChunks = asStringArray(answerData.chunks);
  if (rawChunks.length > 0) {
    state.chunks = rawChunks.map((chunk) =>
      formatCitations(chunk, citationMode, state.searchResults)
    );
  }
}

function extractAnswerDataFromTextPayload(
  streamText: string,
  state: StreamState
): { data: Record<string, unknown> | null; clarifyingQuestions?: string[] } {
  const parsed = parseJsonSafely(streamText);

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const step = asRecord(item);
      if (!step) continue;

      const stepType = asString(step.step_type);
      if (stepType === "RESEARCH_CLARIFYING_QUESTIONS") {
        const questions = extractClarifyingQuestions(step.content);
        return { data: null, clarifyingQuestions: questions };
      }

      if (stepType === "FINAL") {
        const rawContent = asRecord(step.content);
        if (!rawContent) return { data: null };

        const answerString = asString(rawContent.answer);
        if (answerString && answerString.trim().startsWith("{")) {
          const parsedAnswer = asRecord(parseJsonSafely(answerString));
          if (parsedAnswer) return { data: parsedAnswer };
        }

        return { data: rawContent };
      }
    }

    return { data: null };
  }

  return { data: asRecord(parsed) };
}

function createWebuiHeaders(sessionToken: string): Record<string, string> {
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

interface SearchInput {
  query: string;
  model?: string;
  sourceFocus?: string[];
  searchFocus?: string;
  timeRange?: string;
  language?: string;
  citationMode?: string;
  saveToLibrary?: boolean;
  conversationUuid?: string;
  readWriteToken?: string;
}

function buildPayload(input: SearchInput): Record<string, unknown> {
  const model = input.model ?? "best";
  const modelConfig = MODEL_MAP[model] ?? MODEL_MAP.best;
  const sources = (input.sourceFocus ?? ["web"]).map(
    (focus) => SOURCE_FOCUS_MAP[focus] ?? "web"
  );

  const params: Record<string, unknown> = {
    attachments: [],
    language: input.language ?? "en-US",
    timezone: null,
    client_coordinates: null,
    sources,
    model_preference: modelConfig.identifier,
    mode: modelConfig.mode,
    search_focus: SEARCH_FOCUS_MAP[input.searchFocus ?? "web"] ?? "internet",
    search_recency_filter: TIME_RANGE_MAP[input.timeRange ?? "all"] ?? null,
    is_incognito: !(input.saveToLibrary ?? false),
    use_schematized_api: false,
    local_search_enabled: false,
    prompt_source: "user",
    send_back_text_in_streaming_api: true,
    version: WEBUI_VERSION,
  };

  if (input.conversationUuid) {
    params.last_backend_uuid = input.conversationUuid;
    params.query_source = "followup";
    if (input.readWriteToken) {
      params.read_write_token = input.readWriteToken;
    }
  }

  return {
    params,
    query_str: input.query,
  };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function perplexitySearch(input: SearchInput): Promise<{
  title: string | null;
  answer: string;
  chunks: string[];
  searchResults: SearchResult[];
  conversationUuid: string | null;
  readWriteToken: string | null;
}> {
  const sessionToken = process.env.PERPLEXITY_SESSION_TOKEN;
  if (!sessionToken || sessionToken.trim().length === 0) {
    throw new Error(
      "PERPLEXITY_SESSION_TOKEN environment variable is required."
    );
  }

  const headers = createWebuiHeaders(sessionToken.trim());
  const initUrl = `${PERPLEXITY_BASE_URL}${PERPLEXITY_SEARCH_INIT_PATH}?q=${encodeURIComponent(input.query)}`;

  await fetchWithTimeout(initUrl, { method: "GET", headers }, REQUEST_TIMEOUT_MS);

  const payload = buildPayload(input);
  const askUrl = `${PERPLEXITY_BASE_URL}${PERPLEXITY_ASK_PATH}`;

  const streamResponse = await fetchWithTimeout(
    askUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    },
    REQUEST_TIMEOUT_MS
  );

  const events = await readSseEvents(streamResponse);
  const state: StreamState = {
    title: null,
    conversationUuid: input.conversationUuid ?? null,
    readWriteToken: input.readWriteToken ?? null,
    answer: null,
    chunks: [],
    searchResults: [],
  };

  const citationMode = input.citationMode ?? "clean";

  for (const event of events) {
    const backendUuid = asString(event.backend_uuid);
    if (backendUuid) state.conversationUuid = backendUuid;

    const rwToken = asString(event.read_write_token);
    if (rwToken) state.readWriteToken = rwToken;

    const threadTitle = asString(event.thread_title);
    if (threadTitle) state.title = threadTitle;

    const streamText = asString(event.text);
    if (!streamText) continue;

    const { data: answerData, clarifyingQuestions } =
      extractAnswerDataFromTextPayload(streamText, state);

    if (clarifyingQuestions && clarifyingQuestions.length > 0) {
      throw new Error(
        `Deep research requires clarifying answers: ${clarifyingQuestions.join(", ")}`
      );
    }

    if (!answerData) continue;

    const answerTitle = asString(answerData.thread_title);
    if (answerTitle) state.title = answerTitle;

    updateStateFromAnswerData(state, answerData, citationMode);
  }

  const answer =
    state.answer ??
    (state.chunks.length > 0 ? state.chunks[state.chunks.length - 1] : null);

  if (!answer || answer.trim().length === 0) {
    throw new Error("Perplexity WebUI returned no answer text.");
  }

  return {
    title: state.title,
    answer,
    chunks: state.chunks,
    searchResults: state.searchResults,
    conversationUuid: state.conversationUuid,
    readWriteToken: state.readWriteToken,
  };
}

// --- MCP Server Setup ---

const server = new McpServer({
  name: "perplexity-webui-mcp",
  version: "1.0.0",
});

const SearchInputSchema = z.object({
  query: z
    .string()
    .min(1, "Query cannot be empty.")
    .max(8000, "Query cannot exceed 8000 characters.")
    .describe("The question or prompt to send to Perplexity."),
  model: z
    .enum([
      "best",
      "deep_research",
      "sonar",
      "gpt_52",
      "gpt_52_thinking",
      "claude_45_sonnet",
      "claude_45_sonnet_thinking",
      "claude_45_opus",
      "claude_45_opus_thinking",
      "gemini_3_flash",
      "gemini_3_flash_thinking",
      "gemini_3_pro_thinking",
      "grok_41",
      "grok_41_thinking",
      "kimi_k25_thinking",
    ])
    .default("best")
    .describe("Model preset to request from Perplexity WebUI."),
  sourceFocus: z
    .array(z.enum(["web", "academic", "social", "finance"]))
    .default(["web"])
    .describe("Source types to prioritize."),
  searchFocus: z
    .enum(["web", "writing"])
    .default("web")
    .describe("Search mode used by the WebUI."),
  timeRange: z
    .enum(["all", "today", "week", "month", "year"])
    .default("all")
    .describe("Recency filter for search results."),
  language: z
    .string()
    .default("en-US")
    .describe("Response language in IETF format (e.g., en-US)."),
  citationMode: z
    .enum(["default", "markdown", "clean"])
    .default("clean")
    .describe("Citation formatting: default (keep [1]), markdown ([1](url)), clean (remove)."),
  saveToLibrary: z
    .boolean()
    .default(false)
    .describe("Whether to save this query to your Perplexity library."),
  conversationUuid: z
    .string()
    .optional()
    .describe("Existing conversation UUID for follow-up questions."),
  readWriteToken: z
    .string()
    .optional()
    .describe("Read-write token from a previous response for follow-ups."),
});

server.tool(
  "perplexity_search",
  "Query Perplexity Pro via WebUI. Returns answer text, citations, and conversation IDs for follow-ups.",
  SearchInputSchema.shape,
  async (args) => {
    try {
      const input = SearchInputSchema.parse(args);
      const result = await perplexitySearch(input);

      const parts: string[] = [];
      if (result.title) {
        parts.push(`# ${result.title}`, "");
      }
      parts.push(result.answer);

      if (result.searchResults.length > 0) {
        parts.push("", "## Sources");
        for (const [index, source] of result.searchResults.entries()) {
          const label = source.title ?? source.url ?? "Untitled source";
          const snippet = source.snippet ? ` - ${source.snippet}` : "";
          parts.push(`${index + 1}. ${label}${snippet}`);
        }
      }

      if (result.conversationUuid) {
        parts.push("", `conversationUuid: ${result.conversationUuid}`);
      }
      if (result.readWriteToken) {
        parts.push(`readWriteToken: ${result.readWriteToken}`);
      }

      return {
        content: [{ type: "text", text: parts.join("\n") }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Perplexity MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
