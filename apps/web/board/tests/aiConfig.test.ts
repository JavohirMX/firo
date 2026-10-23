import {
  AI_CONFIG_STORAGE_KEY,
  DEFAULT_AI_CONFIG,
  createConfiguredAIClient,
  getAIConfig,
  setAIConfig,
} from "../ai";

/*
 * The AI configuration seam (§10.1: local engine, zero cloud calls).
 *
 * `@firo/ai` owns the operations and is tested in its own package. What only
 * this module owns:
 *
 * 1. **Where the config lives.** IndexedDB first, localStorage as the
 *    fallback a locked-down browser still has, defaults when neither
 *    answers. Every field falls back independently: a stored config from an
 *    older build must not blank the endpoint.
 * 2. **Writes merge, they do not overwrite.** Changing the model must not
 *    drop the endpoint someone pointed at their own server.
 * 3. **Storage failure is not a board failure.** A refused write still
 *    returns the effective config; a refused read falls through.
 */

const idbGet = vi.fn();
const idbSet = vi.fn();

vi.mock("idb-keyval", () => ({
  createStore: () => ({}),
  get: (...args: unknown[]) => idbGet(...args),
  set: (...args: unknown[]) => idbSet(...args),
}));

const createLlmClientMock = vi.fn((..._args: unknown[]) => ({
  sentinel: true,
}));

vi.mock("@firo/ai", async (importOriginal) => {
  const original = await importOriginal<typeof import("@firo/ai")>();
  return {
    ...original,
    createLlmClient: (...args: unknown[]) => createLlmClientMock(...args),
  };
});

beforeEach(() => {
  idbGet.mockReset();
  idbSet.mockReset();
  createLlmClientMock.mockClear();
  window.localStorage.clear();
});

describe("getAIConfig", () => {
  it("returns the local Ollama default when nothing is stored", async () => {
    idbGet.mockResolvedValue(undefined);
    const config = await getAIConfig();
    expect(config).toEqual(DEFAULT_AI_CONFIG);
    expect(config).not.toBe(DEFAULT_AI_CONFIG);
  });

  it("reads a fully stored config", async () => {
    const stored = {
      provider: "openai",
      endpoint: "http://192.168.1.10:8080",
      model: "qwen",
      apiKey: "sk-local",
    };
    idbGet.mockResolvedValue(stored);
    expect(await getAIConfig()).toEqual(stored);
  });

  it("falls back per field, never to a blank config", async () => {
    idbGet.mockResolvedValue({ model: "mistral" });
    expect(await getAIConfig()).toEqual({
      provider: DEFAULT_AI_CONFIG.provider,
      endpoint: DEFAULT_AI_CONFIG.endpoint,
      model: "mistral",
      apiKey: "",
    });
  });

  it("falls back to localStorage when IndexedDB throws", async () => {
    idbGet.mockRejectedValue(new Error("idb blocked"));
    window.localStorage.setItem(
      AI_CONFIG_STORAGE_KEY,
      JSON.stringify({ endpoint: "http://nas:11434", model: "phi" }),
    );
    expect(await getAIConfig()).toEqual({
      provider: DEFAULT_AI_CONFIG.provider,
      endpoint: "http://nas:11434",
      model: "phi",
      apiKey: "",
    });
  });

  it("uses localStorage when IndexedDB simply has nothing", async () => {
    idbGet.mockResolvedValue(undefined);
    window.localStorage.setItem(
      AI_CONFIG_STORAGE_KEY,
      JSON.stringify({ provider: "openai" }),
    );
    const config = await getAIConfig();
    expect(config.provider).toBe("openai");
    expect(config.endpoint).toBe(DEFAULT_AI_CONFIG.endpoint);
  });

  it("ignores corrupt localStorage JSON and returns the default", async () => {
    idbGet.mockResolvedValue(undefined);
    window.localStorage.setItem(AI_CONFIG_STORAGE_KEY, "{not json");
    expect(await getAIConfig()).toEqual(DEFAULT_AI_CONFIG);
  });
});

describe("setAIConfig", () => {
  it("merges a partial update over the stored config", async () => {
    idbGet.mockResolvedValue({
      provider: "openai",
      endpoint: "http://nas:11434",
      model: "phi",
      apiKey: "k",
    });
    const updated = await setAIConfig({ model: "llama3:70b" });
    expect(updated).toEqual({
      provider: "openai",
      endpoint: "http://nas:11434",
      model: "llama3:70b",
      apiKey: "k",
    });
  });

  it("preserves stored fields the update does not name", async () => {
    idbGet.mockResolvedValue({
      provider: "openai",
      endpoint: "http://nas:11434",
      model: "phi",
      apiKey: "k",
    });
    const updated = await setAIConfig({ provider: "ollama" });
    expect(updated).toEqual({
      provider: "ollama",
      endpoint: "http://nas:11434",
      model: "phi",
      apiKey: "k",
    });
  });

  it("persists the merged config to both stores", async () => {
    idbGet.mockResolvedValue(undefined);
    const updated = await setAIConfig({ model: "phi" });
    expect(idbSet).toHaveBeenCalledWith(
      AI_CONFIG_STORAGE_KEY,
      updated,
      expect.anything(),
    );
    expect(
      JSON.parse(window.localStorage.getItem(AI_CONFIG_STORAGE_KEY)!),
    ).toEqual(updated);
  });

  it("still writes localStorage and returns the config when IndexedDB refuses", async () => {
    idbGet.mockResolvedValue(undefined);
    idbSet.mockRejectedValue(new Error("quota"));
    const updated = await setAIConfig({ model: "phi" });
    expect(updated.model).toBe("phi");
    expect(
      JSON.parse(window.localStorage.getItem(AI_CONFIG_STORAGE_KEY)!).model,
    ).toBe("phi");
  });
});

describe("createConfiguredAIClient", () => {
  it("builds the client from the default local config when given nothing", () => {
    createConfiguredAIClient();
    expect(createLlmClientMock).toHaveBeenCalledWith({
      provider: DEFAULT_AI_CONFIG.provider,
      baseUrl: DEFAULT_AI_CONFIG.endpoint,
      model: DEFAULT_AI_CONFIG.model,
      apiKey: undefined,
      fetchFn: undefined,
    });
  });

  it("prefers explicit config, naming the endpoint as the client base URL", () => {
    const fetchFn = vi.fn();
    createConfiguredAIClient(
      { endpoint: "http://nas:11434", model: "phi" },
      fetchFn as unknown as typeof fetch,
    );
    expect(createLlmClientMock).toHaveBeenCalledWith({
      provider: DEFAULT_AI_CONFIG.provider,
      baseUrl: "http://nas:11434",
      model: "phi",
      apiKey: undefined,
      fetchFn,
    });
  });
});
