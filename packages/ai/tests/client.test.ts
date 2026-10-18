/**
 * Tests for Local Model Client.
 */
import { describe, expect, test, vi } from "vitest";

import {
  createLlmClient,
  extractJsonFromText,
  LlmClientError,
  LocalLlmClient,
  resolveEndpointUrl,
} from "../src/client.js";

describe("Local Model Client: Endpoint URL resolution", () => {
  test("resolves default Ollama URL to /api/chat", () => {
    expect(resolveEndpointUrl("ollama")).toBe(
      "http://localhost:11434/api/chat",
    );
  });

  test("resolves custom Ollama base URL cleanly", () => {
    expect(resolveEndpointUrl("ollama", "http://127.0.0.1:11434/")).toBe(
      "http://127.0.0.1:11434/api/chat",
    );
  });

  test("resolves Ollama /v1 endpoint to /v1/chat/completions", () => {
    expect(resolveEndpointUrl("ollama", "http://localhost:11434/v1")).toBe(
      "http://localhost:11434/v1/chat/completions",
    );
  });

  test("preserves explicit Ollama full endpoints", () => {
    expect(
      resolveEndpointUrl("ollama", "http://localhost:11434/api/chat"),
    ).toBe("http://localhost:11434/api/chat");
  });

  test("resolves default OpenAI-compatible URL", () => {
    expect(resolveEndpointUrl("openai-compatible")).toBe(
      "http://localhost:1234/v1/chat/completions",
    );
  });

  test("resolves custom OpenAI-compatible endpoint with /v1", () => {
    expect(
      resolveEndpointUrl("openai-compatible", "http://my-gpu:8000/v1"),
    ).toBe("http://my-gpu:8000/v1/chat/completions");
  });

  test("resolves custom OpenAI-compatible base URL without /v1", () => {
    expect(resolveEndpointUrl("openai-compatible", "http://my-gpu:8000")).toBe(
      "http://my-gpu:8000/v1/chat/completions",
    );
  });
});

describe("Local Model Client: JSON extraction", () => {
  test("parses plain JSON object", () => {
    const parsed = extractJsonFromText<{ ok: boolean }>('{"ok": true}');
    expect(parsed).toEqual({ ok: true });
  });

  test("parses markdown fenced json block", () => {
    const raw = '```json\n{\n  "message": "success",\n  "count": 42\n}\n```';
    const parsed = extractJsonFromText<{ message: string; count: number }>(raw);
    expect(parsed).toEqual({ message: "success", count: 42 });
  });

  test("parses JSON embedded inside surrounding conversational text", () => {
    const raw =
      "Sure! Here is the requested structured output:\n\n" +
      '{"result": "active", "items": [1, 2, 3]}\n\n' +
      "Let me know if you need anything else!";
    const parsed = extractJsonFromText<{ result: string; items: number[] }>(
      raw,
    );
    expect(parsed).toEqual({ result: "active", items: [1, 2, 3] });
  });

  test("parses JSON array", () => {
    const raw = '[{"id": "1"}, {"id": "2"}]';
    const parsed = extractJsonFromText<Array<{ id: string }>>(raw);
    expect(parsed).toHaveLength(2);
  });

  test("throws LlmClientError with PARSE_ERROR when content is unparseable", () => {
    expect(() => extractJsonFromText("Not JSON at all")).toThrow(
      LlmClientError,
    );
    try {
      extractJsonFromText("Not JSON");
    } catch (err) {
      expect((err as LlmClientError).code).toBe("PARSE_ERROR");
    }
  });
});

describe("Local Model Client: Request formatting and response handling", () => {
  test("formats Ollama payload with native options and system prompt", async () => {
    let capturedUrl = "";
    let capturedBody: any = null;

    const mockFetch = vi.fn().mockImplementation(async (url, init) => {
      capturedUrl = url.toString();
      capturedBody = JSON.parse(init.body as string);
      return {
        ok: true,
        json: async () => ({
          message: { role: "assistant", content: "Ollama says hello" },
          done: true,
        }),
      };
    });

    const client = createLlmClient({
      provider: "ollama",
      baseUrl: "http://localhost:11434",
      model: "mistral",
      temperature: 0.1,
      systemPrompt: "You are a helpful assistant",
      fetchFn: mockFetch as any,
    });

    const res = await client.complete("Ping", { formatJson: true });
    expect(res).toBe("Ollama says hello");
    expect(capturedUrl).toBe("http://localhost:11434/api/chat");
    expect(capturedBody.model).toBe("mistral");
    expect(capturedBody.format).toBe("json");
    expect(capturedBody.options.temperature).toBe(0.1);
    expect(capturedBody.messages[0]).toEqual({
      role: "system",
      content: "You are a helpful assistant",
    });
    expect(capturedBody.messages[1]).toEqual({
      role: "user",
      content: "Ping",
    });
  });

  test("formats OpenAI-compatible payload correctly", async () => {
    let capturedUrl = "";
    let capturedBody: any = null;

    const mockFetch = vi.fn().mockImplementation(async (url, init) => {
      capturedUrl = url.toString();
      capturedBody = JSON.parse(init.body as string);
      return {
        ok: true,
        json: async () => ({
          choices: [
            { message: { role: "assistant", content: "OpenAI says hello" } },
          ],
        }),
      };
    });

    const client = createLlmClient({
      provider: "openai-compatible",
      baseUrl: "http://localhost:1234/v1",
      model: "qwen2.5",
      fetchFn: mockFetch as any,
    });

    const res = await client.complete("Hello", { formatJson: true });
    expect(res).toBe("OpenAI says hello");
    expect(capturedUrl).toBe("http://localhost:1234/v1/chat/completions");
    expect(capturedBody.response_format).toEqual({ type: "json_object" });
  });

  test("handles unreachable endpoint with friendly UNREACHABLE error", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    const client = new LocalLlmClient({
      baseUrl: "http://localhost:11434",
      fetchFn: mockFetch as any,
    });

    await expect(client.complete("Hi")).rejects.toThrow(LlmClientError);
    try {
      await client.complete("Hi");
    } catch (err: any) {
      expect(err.code).toBe("UNREACHABLE");
      expect(err.message).toContain("Could not connect to local AI provider");
      expect(err.message).toContain("Ensure Ollama");
    }
  });

  test("handles timeout with friendly TIMEOUT error", async () => {
    const mockFetch = vi.fn().mockImplementation(
      () =>
        new Promise((_, reject) => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          setTimeout(() => reject(err), 5);
        }),
    );

    const client = new LocalLlmClient({
      timeoutMs: 10,
      fetchFn: mockFetch as any,
    });

    await expect(client.complete("Slow")).rejects.toThrow(LlmClientError);
    try {
      await client.complete("Slow");
    } catch (err: any) {
      expect(err.code).toBe("TIMEOUT");
      expect(err.message).toContain("timed out after 10ms");
    }
  });

  test("handles HTTP errors gracefully with status code", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "model 'non-existent' not found",
    });

    const client = new LocalLlmClient({ fetchFn: mockFetch as any });

    try {
      await client.complete("Hello");
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(LlmClientError);
      expect(err.code).toBe("HTTP_ERROR");
      expect(err.status).toBe(404);
      expect(err.message).toContain("404 Not Found");
      expect(err.message).toContain("non-existent");
    }
  });

  test("sends Authorization header when apiKey is configured", async () => {
    let capturedHeaders: Record<string, string> = {};
    const mockFetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedHeaders = options.headers;
      return {
        ok: true,
        json: async () => ({
          message: { role: "assistant", content: "pong" },
        }),
      };
    });

    const client = new LocalLlmClient({
      apiKey: "secret-key-123",
      fetchFn: mockFetch as any,
    });

    await client.complete("Ping");
    expect(capturedHeaders.Authorization).toBe("Bearer secret-key-123");
  });

  test("ping returns true on successful response and false on failure", async () => {
    const successFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    const successClient = new LocalLlmClient({
      fetchFn: successFetch as any,
    });
    expect(await successClient.ping()).toBe(true);

    const failFetch = vi.fn().mockRejectedValue(new Error("Network Error"));
    const failClient = new LocalLlmClient({
      fetchFn: failFetch as any,
    });
    expect(await failClient.ping()).toBe(false);
  });
});
