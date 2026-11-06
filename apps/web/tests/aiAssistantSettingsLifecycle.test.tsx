import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createFiroDoc } from "@firo/doc";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AIAssistantModal } from "../components/AIAssistantModal";
import { getAIConfig, type AIConfig } from "../board/ai";

vi.mock("../board/ai", async (original) => ({
  ...(await original<typeof import("../board/ai")>()),
  getAIConfig: vi.fn(),
}));

const deferred = () => {
  let resolve!: (value: AIConfig) => void;
  const promise = new Promise<AIConfig>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const saved: AIConfig = {
  provider: "ollama",
  endpoint: "http://localhost:11434",
  model: "saved-model",
};

beforeEach(() => vi.resetAllMocks());
describe("assistant settings load lifecycle", () => {
  it("keeps nested settings disabled while the assistant loads saved configuration", async () => {
    const load = deferred();
    vi.mocked(getAIConfig).mockReturnValue(load.promise);
    render(<AIAssistantModal isOpen onClose={vi.fn()} doc={createFiroDoc()} />);
    fireEvent.click(screen.getByTestId("ai-assistant-settings-btn"));
    expect(screen.getByTestId("ai-save-btn")).toBeDisabled();
    expect(screen.getByTestId("ai-model-input")).toBeDisabled();
    await act(async () => load.resolve(saved));
    expect(screen.getByTestId("ai-save-btn")).toBeEnabled();
    expect(screen.getByTestId("ai-model-input")).toHaveValue(saved.model);
  });

  it("does not restore an earlier assistant session's settings after reopen", async () => {
    const old = deferred();
    vi.mocked(getAIConfig)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(saved);
    const props = { onClose: vi.fn(), doc: createFiroDoc() };
    const view = render(<AIAssistantModal isOpen {...props} />);
    view.rerender(<AIAssistantModal isOpen={false} {...props} />);
    view.rerender(<AIAssistantModal isOpen {...props} />);
    await act(async () => {});
    await act(async () => old.resolve({ ...saved, model: "old-model" }));
    expect(screen.getByTestId("ai-model-badge").textContent).toContain(
      saved.model,
    );
  });
});
