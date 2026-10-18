/**
 * Local Model Client.
 *
 * Communicates with local inference servers (Ollama or OpenAI-compatible endpoints)
 * using standard HTTP APIs. Strictly adheres to NFR-3 (zero telemetry or cloud calls).
 */
import { LlmClientError } from "./types.js";

import type {
  ChatMessage,
  LlmClient,
  LlmClientConfig,
  LlmGenerateOptions,
  LlmProviderType,
} from "./types.js";

export { LlmClientError };

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_OPENAI_URL = "http://localhost:1234/v1";
const DEFAULT_MODEL = "llama3";
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_TEMPERATURE = 0.2;

/**
 * Extracts and parses JSON from raw LLM output, handling markdown code fences
 * and preamble text gracefully.
 */
export function extractJsonFromText<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // continue
  }

  // Check for markdown code fences (```json ... ``` or ``` ... ```)
  const codeBlockMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  if (codeBlockMatch?.[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim()) as T;
    } catch {
      // continue
    }
  }

  // Fallback: look for outermost object { ... }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as T;
    } catch {
      // continue
    }
  }

  // Fallback: look for outermost array [ ... ]
  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1)) as T;
    } catch {
      // continue
    }
  }

  throw new LlmClientError(
    `Failed to parse JSON from local AI response: ${trimmed.slice(0, 160)}...`,
    "PARSE_ERROR",
  );
}

/**
 * Resolves the full URL for the chat completions endpoint based on provider and baseUrl.
 */
export function resolveEndpointUrl(
  provider: LlmProviderType,
  baseUrl?: string,
): string {
  const rawBase =
    baseUrl ||
    (provider === "openai-compatible"
      ? DEFAULT_OPENAI_URL
      : DEFAULT_OLLAMA_URL);
  const trimmed = rawBase.replace(/\/+$/, "");

  if (provider === "ollama") {
    if (
      trimmed.endsWith("/api/chat") ||
      trimmed.endsWith("/v1/chat/completions")
    ) {
      return trimmed;
    }
    if (trimmed.endsWith("/v1")) {
      return `${trimmed}/chat/completions`;
    }
    return `${trimmed}/api/chat`;
  }

  // OpenAI-compatible
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

export class LocalLlmClient implements LlmClient {
  readonly config: Readonly<LlmClientConfig>;
  private readonly fetchImpl: typeof fetch;

  constructor(config: LlmClientConfig = {}) {
    this.config = {
      provider: config.provider ?? "ollama",
      baseUrl: config.baseUrl,
      model: config.model ?? DEFAULT_MODEL,
      temperature: config.temperature ?? DEFAULT_TEMPERATURE,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      systemPrompt: config.systemPrompt,
      fetchFn: config.fetchFn,
      apiKey: config.apiKey,
    };
    this.fetchImpl = config.fetchFn ?? globalThis.fetch;
  }

  getEndpointUrl(): string {
    return resolveEndpointUrl(
      this.config.provider ?? "ollama",
      this.config.baseUrl,
    );
  }

  async chat(
    messages: readonly ChatMessage[],
    options?: LlmGenerateOptions,
  ): Promise<string> {
    const provider = this.config.provider ?? "ollama";
    const endpoint = this.getEndpointUrl();
    const model = options?.model ?? this.config.model ?? DEFAULT_MODEL;
    const temperature =
      options?.temperature ?? this.config.temperature ?? DEFAULT_TEMPERATURE;
    const timeoutMs =
      options?.timeoutMs ?? this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const systemPrompt = options?.systemPrompt ?? this.config.systemPrompt;
    const formatJson = options?.formatJson ?? false;

    // Build message list with system prompt if specified
    const fullMessages: ChatMessage[] = [];
    if (systemPrompt && !messages.some((m) => m.role === "system")) {
      fullMessages.push({ role: "system", content: systemPrompt });
    }
    fullMessages.push(...messages);

    // Build payload according to protocol
    let body: Record<string, unknown>;
    if (provider === "ollama" && endpoint.endsWith("/api/chat")) {
      body = {
        model,
        messages: fullMessages,
        stream: false,
        options: { temperature },
        ...(formatJson ? { format: "json" } : {}),
      };
    } else {
      // OpenAI format
      body = {
        model,
        messages: fullMessages,
        temperature,
        stream: false,
        ...(formatJson ? { response_format: { type: "json_object" } } : {}),
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    try {
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new LlmClientError(
          `Local AI provider error: HTTP ${response.status} ${
            response.statusText
          }${errorText ? `: ${errorText}` : ""}`,
          "HTTP_ERROR",
          { status: response.status },
        );
      }

      const json = (await response.json().catch((err) => {
        throw new LlmClientError(
          `Invalid JSON response received from local AI provider: ${String(
            err,
          )}`,
          "INVALID_RESPONSE",
          { cause: err },
        );
      })) as Record<string, unknown>;

      // Extract content from response (supporting Ollama and OpenAI-compatible shapes flexibly)
      let content: string | undefined;
      const msg = json.message as { content?: string } | undefined;
      if (typeof msg?.content === "string") {
        content = msg.content;
      } else {
        const choices = json.choices as
          | Array<{ message?: { content?: string } }>
          | undefined;
        if (typeof choices?.[0]?.message?.content === "string") {
          content = choices[0].message.content;
        } else if (typeof json.response === "string") {
          content = json.response;
        }
      }

      if (typeof content !== "string") {
        throw new LlmClientError(
          `Local AI response did not contain message content: ${JSON.stringify(
            json,
          )}`,
          "INVALID_RESPONSE",
        );
      }

      return content;
    } catch (err: unknown) {
      if (err instanceof LlmClientError) {
        throw err;
      }

      const errorObj = err as {
        name?: string;
        message?: string;
        code?: string;
      };
      if (errorObj?.name === "AbortError" || controller.signal.aborted) {
        throw new LlmClientError(
          `Request to local AI provider timed out after ${timeoutMs}ms.`,
          "TIMEOUT",
          { cause: err },
        );
      }

      // Check for connection refusal or network errors
      const isNetworkError =
        err instanceof TypeError ||
        errorObj?.code === "ECONNREFUSED" ||
        errorObj?.code === "ENOTFOUND" ||
        /fetch failed|network|failed to fetch|econnrefused/i.test(
          errorObj?.message ?? "",
        );

      if (isNetworkError) {
        throw new LlmClientError(
          `Could not connect to local AI provider at ${endpoint}. Ensure Ollama or your local LLM server is running.`,
          "UNREACHABLE",
          { cause: err },
        );
      }

      throw new LlmClientError(
        `Unexpected error communicating with local AI provider: ${String(err)}`,
        "INVALID_RESPONSE",
        { cause: err },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async complete(
    prompt: string,
    options?: LlmGenerateOptions,
  ): Promise<string> {
    return this.chat([{ role: "user", content: prompt }], options);
  }

  async completeJson<T>(
    prompt: string,
    options?: LlmGenerateOptions,
  ): Promise<T> {
    const raw = await this.complete(prompt, {
      ...options,
      formatJson: true,
    });
    return extractJsonFromText<T>(raw);
  }

  /**
   * Pings the local LLM endpoint to verify connectivity and readiness.
   * Returns true if the endpoint responded successfully, false otherwise.
   */
  async ping(): Promise<boolean> {
    const provider = this.config.provider ?? "ollama";
    const rawBase =
      this.config.baseUrl ||
      (provider === "openai-compatible"
        ? DEFAULT_OPENAI_URL
        : DEFAULT_OLLAMA_URL);
    const trimmed = rawBase.replace(/\/+$/, "");

    const probeUrl =
      provider === "ollama"
        ? trimmed.endsWith("/api/chat")
          ? trimmed.replace(/\/api\/chat$/, "/api/tags")
          : `${trimmed}/api/tags`
        : trimmed.endsWith("/chat/completions")
        ? trimmed.replace(/\/chat\/completions$/, "/models")
        : trimmed.endsWith("/v1")
        ? `${trimmed}/models`
        : `${trimmed}/v1/models`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const headers: Record<string, string> = {};
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    try {
      let res = await this.fetchImpl(probeUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
      }).catch(async () => {
        return await this.fetchImpl(trimmed, {
          method: "GET",
          headers,
          signal: controller.signal,
        });
      });

      if (!res.ok) {
        res = await this.fetchImpl(trimmed, {
          method: "GET",
          headers,
          signal: controller.signal,
        });
      }

      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Creates a configured local LLM client instance.
 */
export function createLlmClient(config?: LlmClientConfig): LlmClient {
  return new LocalLlmClient(config);
}
