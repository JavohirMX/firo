import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AI_ENABLED_KEY,
  getAIAvailable,
  isAIConfigured,
  setAIEnabled,
} from "../aiAvailability";

vi.mock("../ai", () => ({
  getAIConfig: async () => ({
    provider: "ollama",
    endpoint: "http://localhost:11434",
    model: "model",
  }),
}));
beforeEach(() => localStorage.clear());
describe("AI opt-in", () => {
  it("stays hidden by default even with local model defaults", async () => {
    expect(await getAIAvailable()).toBe(false);
  });
  it("requires explicit enablement and can be switched off again", async () => {
    setAIEnabled(true);
    expect(localStorage.getItem(AI_ENABLED_KEY)).toBe("true");
    expect(await getAIAvailable()).toBe(true);
    setAIEnabled(false);
    expect(await getAIAvailable()).toBe(false);
  });
  it("requires a valid endpoint and model", () => {
    const config = {
      provider: "ollama" as const,
      endpoint: "http://localhost:11434",
      model: "model",
    };
    expect(isAIConfigured(config)).toBe(true);
    expect(isAIConfigured({ ...config, model: "" })).toBe(false);
    expect(
      isAIConfigured({ ...config, endpoint: "ftp://example.invalid" }),
    ).toBe(false);
    expect(isAIConfigured({ ...config, endpoint: "not a url" })).toBe(false);
  });
});
