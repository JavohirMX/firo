import React, { useEffect, useState } from "react";

import {
  AISettingsModal,
  CloseIcon,
  SettingsIcon,
  SparklesIcon,
  CheckIcon,
} from "@firo/ui";

import type { FiroDoc } from "@firo/doc";
import type { FiroElement } from "@firo/schema";
import type { LlmClient } from "@firo/ai";

import {
  getAIConfig,
  setAIConfig,
  executeClusterStickies,
  executeSummarize,
  executeGenerateDiagram,
  executeGenerateTable,
  DEFAULT_AI_CONFIG,
  type AIConfig,
} from "../board/ai";

import "./AIAssistantModal.scss";

export type AIAssistantTab = "cluster" | "summarize" | "diagram" | "table";

export interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  doc: FiroDoc;
  selectedElements?: readonly FiroElement[];
  position?: { x: number; y: number };
  client?: LlmClient;
  initialTab?: AIAssistantTab;
  onSuccess?: (type: AIAssistantTab, data: unknown) => void;
  onError?: (err: Error) => void;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  isOpen,
  onClose,
  doc,
  selectedElements = [],
  position,
  client,
  initialTab,
  onSuccess,
  onError,
}) => {
  const [config, setConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);
  const [activeTab, setActiveTab] = useState<AIAssistantTab>("cluster");
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Filter selected stickies and elements
  const nonDeletedElements = selectedElements.filter((e) => !e.isDeleted);
  const stickies = nonDeletedElements.filter((e) => e.type === "stickynote");
  const hasStickies = stickies.length > 0;
  const hasElements = nonDeletedElements.length > 0;

  // Load configuration on mount or open
  useEffect(() => {
    if (isOpen) {
      getAIConfig().then(setConfig);
      setStatus("idle");
      setStatusMessage("");
      setPrompt("");

      if (initialTab) {
        setActiveTab(initialTab);
      } else if (hasStickies) {
        setActiveTab("cluster");
      } else if (hasElements) {
        setActiveTab("summarize");
      } else {
        setActiveTab("diagram");
      }
    }
  }, [isOpen, initialTab, hasStickies, hasElements]);

  // Handle escape key
  /* Keep the latest onClose without detaching the listener on every
     render: an inline onClose prop changes identity per render, which
     tore the Escape listener down and rebuilt it in passive effects,
     dropping Escape presses that landed in between. */
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen || isSettingsOpen) {
      return undefined;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSettingsOpen]);

  if (!isOpen) {
    return null;
  }

  const handleExecute = async () => {
    setStatus("loading");
    setStatusMessage("Running local AI model...");

    try {
      if (activeTab === "cluster") {
        if (!hasStickies) {
          throw new Error("Please select sticky notes to cluster.");
        }
        const { result } = await executeClusterStickies(doc, stickies, {
          client,
        });
        setStatus("success");
        setStatusMessage(
          `Clustered ${stickies.length} notes into ${
            result.clusters.length
          } group${result.clusters.length === 1 ? "" : "s"}.`,
        );
        onSuccess?.("cluster", result);
      } else if (activeTab === "summarize") {
        const elementsToSummarize = hasElements
          ? nonDeletedElements
          : doc.read().elements ?? [];

        if (elementsToSummarize.length === 0) {
          throw new Error("No elements found on the board to summarize.");
        }

        const { result } = await executeSummarize(doc, elementsToSummarize, {
          position,
          client,
        });
        setStatus("success");
        setStatusMessage(
          `Created summary sticky note on canvas (${
            result.title || "Summary"
          }).`,
        );
        onSuccess?.("summarize", result);
      } else if (activeTab === "diagram") {
        const trimmed = prompt.trim();
        if (!trimmed) {
          throw new Error("Please enter a description for the diagram.");
        }
        const { result } = await executeGenerateDiagram(
          doc,
          trimmed,
          position,
          { client },
        );
        setStatus("success");
        setStatusMessage(
          `Generated diagram with ${result.nodes.length} nodes and ${result.edges.length} connections.`,
        );
        onSuccess?.("diagram", result);
      } else if (activeTab === "table") {
        const trimmed = prompt.trim();
        if (!trimmed) {
          throw new Error("Please enter a description for the table.");
        }
        const result = await executeGenerateTable(doc, trimmed, {
          client,
        });
        setStatus("success");
        setStatusMessage(
          `Generated collection "${result.collection.name}" with ${result.records.length} records.`,
        );
        onSuccess?.("table", result);
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      setStatus("error");
      setStatusMessage(error.message);
      onError?.(error);
    }
  };

  const handleSettingsSave = async (newConfig: AIConfig) => {
    const updated = await setAIConfig(newConfig);
    setConfig(updated);
  };

  return (
    <>
      <div
        className="firo-ai-assistant-overlay"
        onClick={onClose}
        role="presentation"
        data-testid="ai-assistant-modal-overlay"
      >
        <div
          className="firo-ai-assistant-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-assistant-title"
          onClick={(e) => e.stopPropagation()}
          data-testid="ai-assistant-modal"
        >
          {/* Header */}
          <div className="firo-ai-assistant-modal__header">
            <div className="firo-ai-assistant-modal__title-group">
              <span className="firo-ai-assistant-modal__icon">
                <SparklesIcon size={20} />
              </span>
              <h2
                id="ai-assistant-title"
                className="firo-ai-assistant-modal__title"
              >
                Local AI Assistant
              </h2>
              <span
                className="firo-ai-assistant-modal__badge"
                data-testid="ai-model-badge"
              >
                {config.provider === "ollama" ? "Ollama" : "Local OpenAI"}:{" "}
                {config.model}
              </span>
            </div>

            <div className="firo-ai-assistant-modal__header-actions">
              <button
                type="button"
                className="firo-ai-assistant-modal__action-icon-btn"
                onClick={() => setIsSettingsOpen(true)}
                aria-label="AI Settings"
                title="Configure Local Model Settings"
                data-testid="ai-assistant-settings-btn"
              >
                <SettingsIcon size={18} />
              </button>
              <button
                type="button"
                className="firo-ai-assistant-modal__action-icon-btn"
                onClick={onClose}
                aria-label="Close"
                data-testid="ai-assistant-close-btn"
              >
                <CloseIcon size={16} />
              </button>
            </div>
          </div>

          {/* Action Tabs */}
          <div
            className="firo-ai-assistant-modal__tabs"
            role="tablist"
            aria-label="AI Operations"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "cluster"}
              className={`firo-ai-assistant-modal__tab ${
                activeTab === "cluster"
                  ? "firo-ai-assistant-modal__tab--active"
                  : ""
              }`}
              onClick={() => {
                setActiveTab("cluster");
                setStatus("idle");
              }}
              data-testid="tab-cluster"
            >
              Cluster Sticky Notes
              {hasStickies && ` (${stickies.length})`}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "summarize"}
              className={`firo-ai-assistant-modal__tab ${
                activeTab === "summarize"
                  ? "firo-ai-assistant-modal__tab--active"
                  : ""
              }`}
              onClick={() => {
                setActiveTab("summarize");
                setStatus("idle");
              }}
              data-testid="tab-summarize"
            >
              Summarize
              {hasElements && ` (${nonDeletedElements.length})`}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "diagram"}
              className={`firo-ai-assistant-modal__tab ${
                activeTab === "diagram"
                  ? "firo-ai-assistant-modal__tab--active"
                  : ""
              }`}
              onClick={() => {
                setActiveTab("diagram");
                setStatus("idle");
              }}
              data-testid="tab-diagram"
            >
              Generate Diagram
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "table"}
              className={`firo-ai-assistant-modal__tab ${
                activeTab === "table"
                  ? "firo-ai-assistant-modal__tab--active"
                  : ""
              }`}
              onClick={() => {
                setActiveTab("table");
                setStatus("idle");
              }}
              data-testid="tab-table"
            >
              Generate Table
            </button>
          </div>

          {/* Modal Body */}
          <div className="firo-ai-assistant-modal__body">
            {activeTab === "cluster" && (
              <div
                className="firo-ai-assistant-modal__section"
                data-testid="section-cluster"
              >
                <p className="firo-ai-assistant-modal__desc">
                  Analyzes sticky notes by keyword, topic, and sentiment, and
                  automatically organizes them into neat titled columns and
                  enclosing frames.
                </p>
                {hasStickies ? (
                  <div className="firo-ai-assistant-modal__notice firo-ai-assistant-modal__notice--info">
                    {stickies.length} sticky note
                    {stickies.length === 1 ? "" : "s"} selected on canvas ready
                    to cluster.
                  </div>
                ) : (
                  <div className="firo-ai-assistant-modal__notice firo-ai-assistant-modal__notice--info">
                    Select sticky notes on the canvas to cluster them.
                  </div>
                )}
              </div>
            )}

            {activeTab === "summarize" && (
              <div
                className="firo-ai-assistant-modal__section"
                data-testid="section-summarize"
              >
                <p className="firo-ai-assistant-modal__desc">
                  Extracts text, ideas, unresolved questions, and action items
                  from elements and creates an executive summary sticky note on
                  the board.
                </p>
                <div className="firo-ai-assistant-modal__notice firo-ai-assistant-modal__notice--info">
                  {hasElements
                    ? `Summarizing ${
                        nonDeletedElements.length
                      } selected element${
                        nonDeletedElements.length === 1 ? "" : "s"
                      }.`
                    : "No specific elements selected. Will summarize all content on the board."}
                </div>
              </div>
            )}

            {activeTab === "diagram" && (
              <div
                className="firo-ai-assistant-modal__section"
                data-testid="section-diagram"
              >
                <p className="firo-ai-assistant-modal__desc">
                  Converts a natural language process or system flow description
                  into flowchart shapes (rectangles, diamonds, ellipses) and
                  bound connectors.
                </p>
                <textarea
                  className="firo-ai-assistant-modal__textarea"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. User submits login form -> validate credentials -> if valid, issue auth token -> redirect to dashboard; if invalid, show error message."
                  data-testid="ai-prompt-input"
                  aria-label="AI prompt"
                />
              </div>
            )}

            {activeTab === "table" && (
              <div
                className="firo-ai-assistant-modal__section"
                data-testid="section-table"
              >
                <p className="firo-ai-assistant-modal__desc">
                  Parses unstructured requirements, meeting notes, or task lists
                  into a structured, typed records collection and table view.
                </p>
                <textarea
                  className="firo-ai-assistant-modal__textarea"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Product launch tasks: Design QA (Alice, High, In Progress), Performance testing (Bob, Medium, Todo), API Docs (Charlie, Low, Done)."
                  data-testid="ai-prompt-input"
                  aria-label="AI prompt"
                />
              </div>
            )}

            {/* Status alerts */}
            {status === "error" && (
              <div
                className="firo-ai-assistant-modal__notice firo-ai-assistant-modal__notice--error"
                data-testid="ai-error-notice"
              >
                {statusMessage}
              </div>
            )}

            {status === "success" && (
              <div
                className="firo-ai-assistant-modal__notice firo-ai-assistant-modal__notice--success"
                data-testid="ai-success-notice"
              >
                <CheckIcon size={16} />
                {statusMessage}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="firo-ai-assistant-modal__footer">
            <button
              type="button"
              className="firo-ai-assistant-modal__btn firo-ai-assistant-modal__btn--secondary"
              onClick={onClose}
              data-testid="ai-modal-cancel-btn"
            >
              Close
            </button>

            <button
              type="button"
              className="firo-ai-assistant-modal__btn firo-ai-assistant-modal__btn--primary"
              onClick={handleExecute}
              disabled={
                status === "loading" ||
                (activeTab === "cluster" && !hasStickies) ||
                ((activeTab === "diagram" || activeTab === "table") &&
                  !prompt.trim())
              }
              data-testid="ai-execute-btn"
            >
              {status === "loading"
                ? "Processing..."
                : activeTab === "cluster"
                ? "Cluster Stickies"
                : activeTab === "summarize"
                ? "Create Summary"
                : activeTab === "diagram"
                ? "Generate Diagram"
                : "Generate Table"}
            </button>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <AISettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSave={handleSettingsSave}
        client={client}
      />
    </>
  );
};
