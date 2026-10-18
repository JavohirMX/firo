import "fake-indexeddb/auto";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createFiroDoc, type FiroDoc } from "@firo/doc";

import { AISettingsModal } from "@firo/ui";

import type { StickyNoteElement } from "@firo/schema";
import type { LlmClient } from "@firo/ai";

import {
  getAIConfig,
  setAIConfig,
  executeClusterStickies,
  executeSummarize,
  executeGenerateDiagram,
  executeGenerateTable,
} from "../board/ai";
import { AIAssistantModal } from "../components/AIAssistantModal";

function createMockSticky(
  id: string,
  text: string,
  x = 0,
  y = 0,
): StickyNoteElement {
  return {
    id: id as any,
    type: "stickynote",
    x,
    y,
    width: 200,
    height: 200,
    angle: 0 as any,
    strokeColor: "#1e1e1e",
    backgroundColor: "#fff9b1",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roundness: null,
    roughness: 1,
    opacity: 100,
    fontSize: 20,
    fontFamily: 6,
    textAlign: "left",
    verticalAlign: "top",
    version: 1,
    versionNonce: 1,
    index: null,
    created: Date.now(),
    updated: Date.now(),
    isDeleted: false,
    groupIds: [],
    frameId: null,
    containerId: null,
    bindings: [],
    link: null,
    locked: false,
    isContainer: false,
    text,
  };
}

describe("AI Configuration Persistence (§10.1)", () => {
  beforeEach(async () => {
    localStorage.clear();
  });

  it("returns default Ollama config initially", async () => {
    const config = await getAIConfig();
    expect(config.provider).toBe("ollama");
    expect(config.endpoint).toBe("http://localhost:11434");
    expect(config.model).toBe("llama3:8b");
    expect(config.apiKey).toBe("");
  });

  it("persists and retrieves updated config", async () => {
    const updated = await setAIConfig({
      provider: "openai-compatible",
      endpoint: "http://localhost:1234/v1",
      model: "mistral-7b",
      apiKey: "test-token",
    });

    expect(updated.provider).toBe("openai-compatible");
    expect(updated.model).toBe("mistral-7b");

    const retrieved = await getAIConfig();
    expect(retrieved.provider).toBe("openai-compatible");
    expect(retrieved.endpoint).toBe("http://localhost:1234/v1");
    expect(retrieved.model).toBe("mistral-7b");
    expect(retrieved.apiKey).toBe("test-token");
  });
});

describe("Local AI Operations & Undoable Commits (§10.1)", () => {
  let doc: FiroDoc;

  beforeEach(() => {
    doc = createFiroDoc();
  });

  it("executeClusterStickies clusters notes and is 100% undoable", async () => {
    const note1 = createMockSticky("s1", "Fix navigation crash", 10, 10);
    const note2 = createMockSticky("s2", "Add search filter", 300, 10);
    doc.commit([
      { kind: "createElement", element: note1 },
      { kind: "createElement", element: note2 },
    ]);

    const mockClient: LlmClient = {
      config: {},
      getEndpointUrl: () => "http://localhost:11434/api/chat",
      chat: vi.fn(),
      complete: vi.fn(),
      completeJson: vi.fn().mockResolvedValue({
        clusters: [
          {
            id: "cluster-nav",
            title: "Navigation & Search",
            topic: "App usability",
            sentiment: "neutral",
            keywords: ["nav", "search"],
            noteIds: ["s1", "s2"],
          },
        ],
      }),
      ping: vi.fn().mockResolvedValue(true),
    };

    const { result, commit } = await executeClusterStickies(
      doc,
      [note1, note2],
      { client: mockClient },
    );

    expect(commit.changed).toBe(true);
    expect(result.clusters).toHaveLength(1);
    expect(result.frames).toHaveLength(1);

    // Frame created and notes repositioned
    const snap = doc.read();
    const frame = snap.elements.find((e) => e.type === "frame");
    expect(frame).toBeDefined();

    // Undo operation rolls back frame and moves stickies back to original positions
    doc.undo();
    const snapAfterUndo = doc.read();
    expect(snapAfterUndo.elements.some((e) => e.type === "frame")).toBe(false);
    const restoredS1 = snapAfterUndo.elements.find((e) => e.id === "s1");
    expect(restoredS1?.x).toBe(10);
    expect(restoredS1?.y).toBe(10);
  });

  it("executeSummarize creates a summary sticky and is undoable", async () => {
    const note = createMockSticky(
      "s1",
      "Implement offline-first storage",
      50,
      50,
    );
    doc.commit([{ kind: "createElement", element: note }]);

    const mockClient: LlmClient = {
      config: {},
      getEndpointUrl: () => "http://localhost:11434/api/chat",
      chat: vi.fn(),
      complete: vi.fn(),
      completeJson: vi.fn().mockResolvedValue({
        title: "Executive Architecture Summary",
        overview: "The team prioritizes offline-first resilience.",
        themes: [{ name: "Storage", description: "IndexedDB" }],
        unresolvedQuestions: [],
        keyDecisions: ["Use Yjs for CRDT"],
      }),
      ping: vi.fn().mockResolvedValue(true),
    };

    const { result, element, commit } = await executeSummarize(doc, [note], {
      client: mockClient,
      position: { x: 500, y: 50 },
    });

    expect(commit.changed).toBe(true);
    expect(result.title).toBe("Executive Architecture Summary");
    expect(element.type).toBe("stickynote");
    expect(element.text).toContain("Executive Architecture Summary");
    expect(element.text).toContain("offline-first resilience");

    const snap = doc.read();
    expect(snap.elements.some((e) => e.id === element.id)).toBe(true);

    // Undo removes the generated summary note
    doc.undo();
    const snapAfterUndo = doc.read();
    expect(snapAfterUndo.elements.some((e) => e.id === element.id)).toBe(false);
    expect(snapAfterUndo.elements).toHaveLength(1);
    expect(snapAfterUndo.elements[0].id).toBe("s1");
  });

  it("executeGenerateDiagram generates shapes & connectors and is undoable", async () => {
    const mockClient: LlmClient = {
      config: {},
      getEndpointUrl: () => "http://localhost:11434/api/chat",
      chat: vi.fn(),
      complete: vi.fn(),
      completeJson: vi.fn().mockResolvedValue({
        title: "Auth Flow",
        nodes: [
          {
            id: "node-1",
            label: "Enter Credentials",
            shape: "rectangle",
            role: "step",
          },
          {
            id: "node-2",
            label: "Check Password",
            shape: "diamond",
            role: "decision",
          },
        ],
        edges: [{ from: "node-1", to: "node-2", label: "submit" }],
      }),
      ping: vi.fn().mockResolvedValue(true),
    };

    const { result, commit } = await executeGenerateDiagram(
      doc,
      "User enters credentials then checks password",
      { x: 100, y: 100 },
      { client: mockClient },
    );

    expect(commit.changed).toBe(true);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);

    const snap = doc.read();
    expect(snap.elements.length).toBeGreaterThanOrEqual(2);

    // Undo completely removes generated diagram
    doc.undo();
    const snapAfterUndo = doc.read();
    expect(snapAfterUndo.elements).toHaveLength(0);
  });

  it("executeGenerateTable creates typed collection & records and is undoable", async () => {
    const mockClient: LlmClient = {
      config: {},
      getEndpointUrl: () => "http://localhost:11434/api/chat",
      chat: vi.fn(),
      complete: vi.fn(),
      completeJson: vi.fn().mockResolvedValue({
        name: "Project Sprint Tasks",
        columns: [
          { key: "task", name: "Task Name", type: "text" },
          { key: "priority", name: "Priority", type: "text" },
        ],
        records: [
          { task: "Design UI", priority: "High" },
          { task: "Write tests", priority: "Medium" },
        ],
      }),
      ping: vi.fn().mockResolvedValue(true),
    };

    const { collection, records, commit } = await executeGenerateTable(
      doc,
      "Sprint tasks: Design UI (High), Write tests (Medium)",
      { client: mockClient },
    );

    expect(commit.changed).toBe(true);
    expect(collection.name).toBe("Project Sprint Tasks");
    expect(records).toHaveLength(2);

    const snap = doc.read();
    expect(snap.collections?.some((c) => c.id === collection.id)).toBe(true);
    expect(
      snap.records?.filter((r) => r.collectionId === collection.id),
    ).toHaveLength(2);

    // Undo rolls back both collection and records atomically
    doc.undo();
    const snapAfterUndo = doc.read();
    expect(snapAfterUndo.collections?.some((c) => c.id === collection.id)).toBe(
      false,
    );
    expect(
      snapAfterUndo.records?.filter((r) => r.collectionId === collection.id),
    ).toHaveLength(0);
  });
});

describe("AISettingsModal UI Component (§10.1)", () => {
  it("renders configuration dialog and allows updating provider presets", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(
      <AISettingsModal
        isOpen={true}
        onClose={onClose}
        config={{
          provider: "ollama",
          endpoint: "http://localhost:11434",
          model: "llama3:8b",
        }}
        onSave={onSave}
      />,
    );

    expect(screen.getByTestId("ai-settings-modal")).toBeDefined();
    const endpointInput = screen.getByTestId(
      "ai-endpoint-input",
    ) as HTMLInputElement;
    expect(endpointInput.value).toBe("http://localhost:11434");

    // Switch to OpenAI-compatible
    const openaiBtn = screen.getByTestId("provider-openai-btn");
    fireEvent.click(openaiBtn);
    expect(endpointInput.value).toBe("http://localhost:1234/v1");

    // Save
    const saveBtn = screen.getByTestId("ai-save-btn");
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai-compatible",
        endpoint: "http://localhost:1234/v1",
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("Test Connection button calls client.ping() and displays status", async () => {
    const mockPing = vi.fn().mockResolvedValue(true);

    render(
      <AISettingsModal
        isOpen={true}
        onClose={vi.fn()}
        client={{ ping: mockPing }}
      />,
    );

    const testBtn = screen.getByTestId("ai-test-connection-btn");
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(mockPing).toHaveBeenCalled();
      expect(screen.getByTestId("ai-status-success")).toBeDefined();
      expect(screen.getByText(/Connection verified/i)).toBeDefined();
    });
  });
});

describe("AIAssistantModal UI Component (§10.1)", () => {
  let doc: FiroDoc;

  beforeEach(() => {
    doc = createFiroDoc();
  });

  it("activates Cluster tab when sticky notes are selected and executes operation", async () => {
    const note1 = createMockSticky("n1", "Idea 1");
    const note2 = createMockSticky("n2", "Idea 2");
    doc.commit([
      { kind: "createElement", element: note1 },
      { kind: "createElement", element: note2 },
    ]);

    const mockClient: LlmClient = {
      config: {},
      getEndpointUrl: () => "http://localhost:11434/api/chat",
      chat: vi.fn(),
      complete: vi.fn(),
      completeJson: vi.fn().mockResolvedValue({
        clusters: [
          {
            id: "c1",
            title: "Ideas",
            topic: "Ideation",
            sentiment: "positive",
            keywords: ["idea"],
            noteIds: ["n1", "n2"],
          },
        ],
      }),
      ping: vi.fn().mockResolvedValue(true),
    };

    const onSuccess = vi.fn();

    render(
      <AIAssistantModal
        isOpen={true}
        onClose={vi.fn()}
        doc={doc}
        selectedElements={[note1, note2]}
        client={mockClient}
        onSuccess={onSuccess}
      />,
    );

    expect(screen.getByTestId("tab-cluster")).toBeDefined();
    expect(screen.getByText(/2 sticky notes selected/i)).toBeDefined();

    const executeBtn = screen.getByTestId("ai-execute-btn");
    expect(executeBtn.hasAttribute("disabled")).toBe(false);

    fireEvent.click(executeBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith("cluster", expect.any(Object));
      expect(screen.getByTestId("ai-success-notice")).toBeDefined();
    });
  });

  it("switches to Generate Diagram tab and executes prompt", async () => {
    const mockClient: LlmClient = {
      config: {},
      getEndpointUrl: () => "http://localhost:11434/api/chat",
      chat: vi.fn(),
      complete: vi.fn(),
      completeJson: vi.fn().mockResolvedValue({
        title: "Flow",
        nodes: [{ id: "n1", label: "Start", shape: "rectangle" }],
        edges: [],
      }),
      ping: vi.fn().mockResolvedValue(true),
    };

    const onSuccess = vi.fn();

    render(
      <AIAssistantModal
        isOpen={true}
        onClose={vi.fn()}
        doc={doc}
        client={mockClient}
        onSuccess={onSuccess}
      />,
    );

    // Switch to diagram tab
    const diagramTab = screen.getByTestId("tab-diagram");
    fireEvent.click(diagramTab);

    const promptInput = screen.getByTestId("ai-prompt-input");
    fireEvent.change(promptInput, { target: { value: "User login process" } });

    const executeBtn = screen.getByTestId("ai-execute-btn");
    expect(executeBtn.textContent).toContain("Generate Diagram");
    fireEvent.click(executeBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith("diagram", expect.any(Object));
      expect(screen.getByTestId("ai-success-notice")).toBeDefined();
    });
  });

  it("opens settings modal when clicking the gear icon", async () => {
    render(<AIAssistantModal isOpen={true} onClose={vi.fn()} doc={doc} />);

    const settingsBtn = screen.getByTestId("ai-assistant-settings-btn");
    fireEvent.click(settingsBtn);

    expect(screen.getByTestId("ai-settings-modal")).toBeDefined();
  });
});
