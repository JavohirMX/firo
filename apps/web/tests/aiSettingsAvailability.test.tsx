import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AISettings, useAIAvailable } from "../components/AISettings";
import { getAIConfig } from "../board/ai";
import { AI_AVAILABILITY_EVENT, getAIAvailable } from "../board/aiAvailability";

vi.mock("../board/ai", () => ({
  DEFAULT_AI_CONFIG: {
    provider: "ollama",
    endpoint: "http://localhost:11434",
    model: "default",
  },
  getAIConfig: vi.fn(),
  setAIConfig: vi.fn(),
}));
vi.mock("../board/aiAvailability", () => ({
  AI_AVAILABILITY_EVENT: "firo:ai-availability",
  getAIAvailable: vi.fn(),
  readAIEnabled: () => false,
  setAIEnabled: vi.fn(),
}));
vi.mock("@firo/ui", () => ({
  AISettingsModal: ({
    isOpen,
    config,
    loading,
  }: {
    isOpen: boolean;
    config: { model: string };
    loading?: boolean;
  }) =>
    isOpen ? (
      <div>
        <div data-testid="model">{config.model}</div>
        <div data-testid="loading">{String(loading)}</div>
      </div>
    ) : null,
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const Available = () => (
  <div data-testid="available">{String(useAIAvailable())}</div>
);

beforeEach(() => vi.resetAllMocks());
describe("AI settings async ordering", () => {
  it("does not let an earlier enabled read restore tools after opt-out", async () => {
    const earlier = deferred<boolean>();
    vi.mocked(getAIAvailable)
      .mockReturnValueOnce(earlier.promise)
      .mockResolvedValueOnce(false);
    render(<Available />);
    act(() => window.dispatchEvent(new Event(AI_AVAILABILITY_EVENT)));
    await act(async () => {
      earlier.resolve(true);
    });
    expect(screen.getByTestId("available").textContent).toBe("false");
  });

  it("ignores an old settings load after closing and reopening", async () => {
    const old = deferred<Awaited<ReturnType<typeof getAIConfig>>>();
    const next = {
      provider: "ollama" as const,
      endpoint: "http://localhost:11434",
      model: "new-model",
    };
    vi.mocked(getAIConfig)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(next);
    const view = render(<AISettings isOpen onClose={() => {}} />);
    view.rerender(<AISettings isOpen={false} onClose={() => {}} />);
    view.rerender(<AISettings isOpen onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByTestId("model").textContent).toBe("new-model"),
    );
    await act(async () => {
      old.resolve({ ...next, model: "old-model" });
    });
    expect(screen.getByTestId("model").textContent).toBe("new-model");
  });
  it("keeps a new settings session loading until its saved config arrives", async () => {
    const load = deferred<Awaited<ReturnType<typeof getAIConfig>>>();
    vi.mocked(getAIConfig).mockReturnValue(load.promise);
    render(<AISettings isOpen onClose={() => {}} />);
    expect(screen.getByTestId("loading").textContent).toBe("true");
    await act(async () => {
      load.resolve({
        provider: "ollama",
        endpoint: "http://localhost:11434",
        model: "saved-model",
      });
    });
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(screen.getByTestId("model").textContent).toBe("saved-model");
  });
});
