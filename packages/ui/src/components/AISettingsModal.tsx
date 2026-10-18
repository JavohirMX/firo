import React, { useEffect, useState } from "react";

import { CloseIcon, SettingsIcon, CheckIcon } from "../icons";

import "./AISettingsModal.scss";

export interface AISettingsConfig {
  provider: "ollama" | "openai-compatible";
  endpoint: string;
  model: string;
  apiKey?: string;
}

export interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config?: AISettingsConfig;
  onSave?: (config: AISettingsConfig) => void;
  client?: {
    ping: () => Promise<boolean>;
  };
  onTestConnection?: (config: AISettingsConfig) => Promise<boolean>;
}

const DEFAULT_CONFIG: AISettingsConfig = {
  provider: "ollama",
  endpoint: "http://localhost:11434",
  model: "llama3:8b",
  apiKey: "",
};

export const AISettingsModal: React.FC<AISettingsModalProps> = ({
  isOpen,
  onClose,
  config = DEFAULT_CONFIG,
  onSave,
  client,
  onTestConnection,
}) => {
  const [provider, setProvider] = useState<"ollama" | "openai-compatible">(
    config.provider || "ollama",
  );
  const [endpoint, setEndpoint] = useState(
    config.endpoint || "http://localhost:11434",
  );
  const [model, setModel] = useState(config.model || "llama3:8b");
  const [apiKey, setApiKey] = useState(config.apiKey || "");

  const [pingStatus, setPingStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
  const [pingMessage, setPingMessage] = useState("");

  // Sync state when config changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setProvider(config.provider || "ollama");
      setEndpoint(
        config.endpoint ||
          (config.provider === "openai-compatible"
            ? "http://localhost:1234/v1"
            : "http://localhost:11434"),
      );
      setModel(config.model || "llama3:8b");
      setApiKey(config.apiKey || "");
      setPingStatus("idle");
      setPingMessage("");
    }
  }, [isOpen, config]);

  // Keyboard navigation (Escape to close)
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleProviderChange = (
    newProvider: "ollama" | "openai-compatible",
  ) => {
    setProvider(newProvider);
    setPingStatus("idle");
    setPingMessage("");

    // Auto-update default endpoint if currently using standard defaults
    if (
      newProvider === "ollama" &&
      (endpoint === "http://localhost:1234/v1" ||
        endpoint === "http://localhost:1234")
    ) {
      setEndpoint("http://localhost:11434");
    } else if (
      newProvider === "openai-compatible" &&
      endpoint === "http://localhost:11434"
    ) {
      setEndpoint("http://localhost:1234/v1");
    }
  };

  const handleTestConnection = async () => {
    setPingStatus("testing");
    setPingMessage("Testing connection to local model endpoint...");

    const currentConfig: AISettingsConfig = {
      provider,
      endpoint: endpoint.trim(),
      model: model.trim(),
      apiKey: apiKey.trim(),
    };

    try {
      let isReachable = false;
      if (client?.ping) {
        isReachable = await client.ping();
      } else if (onTestConnection) {
        isReachable = await onTestConnection(currentConfig);
      } else {
        // Fallback probe
        const probeUrl = currentConfig.endpoint.replace(/\/+$/, "");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        try {
          const res = await fetch(probeUrl, {
            method: "GET",
            headers: currentConfig.apiKey
              ? { Authorization: `Bearer ${currentConfig.apiKey}` }
              : {},
            signal: controller.signal,
          });
          isReachable = res.ok || res.status === 404;
        } catch {
          isReachable = false;
        } finally {
          clearTimeout(timeout);
        }
      }

      if (isReachable) {
        setPingStatus("success");
        setPingMessage("Connection verified. Local model server is reachable!");
      } else {
        setPingStatus("error");
        setPingMessage(
          `Unable to connect to ${currentConfig.endpoint}. Ensure your local server is running.`,
        );
      }
    } catch (err: unknown) {
      setPingStatus("error");
      setPingMessage(
        `Connection failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  };

  const handleSave = () => {
    const newConfig: AISettingsConfig = {
      provider,
      endpoint: endpoint.trim() || DEFAULT_CONFIG.endpoint,
      model: model.trim() || DEFAULT_CONFIG.model,
      apiKey: apiKey.trim(),
    };
    onSave?.(newConfig);
    onClose();
  };

  return (
    <div
      className="firo-ai-settings-overlay"
      onClick={onClose}
      role="presentation"
      data-testid="ai-settings-modal-overlay"
    >
      <div
        className="firo-ai-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="firo-ai-settings-title"
        onClick={(e) => e.stopPropagation()}
        data-testid="ai-settings-modal"
      >
        {/* Header */}
        <div className="firo-ai-settings-modal__header">
          <div className="firo-ai-settings-modal__title-group">
            <h2
              id="firo-ai-settings-title"
              className="firo-ai-settings-modal__title"
            >
              <SettingsIcon size={20} />
              Local AI Engine Settings
            </h2>
            <p className="firo-ai-settings-modal__subtitle">
              Strictly local inference. Zero cloud network calls or telemetry
              (NFR-3).
            </p>
          </div>
          <button
            type="button"
            className="firo-ai-settings-modal__close-btn"
            onClick={onClose}
            aria-label="Close dialog"
            data-testid="ai-settings-close-btn"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Form Body */}
        <div className="firo-ai-settings-modal__body">
          {/* Provider Selection */}
          <div className="firo-ai-settings-modal__field">
            <label className="firo-ai-settings-modal__label">
              Inference Provider
            </label>
            <div
              className="firo-ai-settings-modal__provider-tabs"
              role="radiogroup"
              aria-label="AI Provider"
            >
              <button
                type="button"
                role="radio"
                aria-checked={provider === "ollama"}
                className={`firo-ai-settings-modal__provider-tab ${
                  provider === "ollama"
                    ? "firo-ai-settings-modal__provider-tab--active"
                    : ""
                }`}
                onClick={() => handleProviderChange("ollama")}
                data-testid="provider-ollama-btn"
              >
                Ollama (Default)
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={provider === "openai-compatible"}
                className={`firo-ai-settings-modal__provider-tab ${
                  provider === "openai-compatible"
                    ? "firo-ai-settings-modal__provider-tab--active"
                    : ""
                }`}
                onClick={() => handleProviderChange("openai-compatible")}
                data-testid="provider-openai-btn"
              >
                OpenAI-Compatible (LM Studio / vLLM / LocalAI)
              </button>
            </div>
            <span className="firo-ai-settings-modal__hint">
              Select Ollama for native local models or any OpenAI-compatible
              local server.
            </span>
          </div>

          {/* Endpoint URL */}
          <div className="firo-ai-settings-modal__field">
            <label
              htmlFor="ai-endpoint-input"
              className="firo-ai-settings-modal__label"
            >
              Endpoint URL
            </label>
            <input
              id="ai-endpoint-input"
              type="text"
              className="firo-ai-settings-modal__input"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder={
                provider === "ollama"
                  ? "http://localhost:11434"
                  : "http://localhost:1234/v1"
              }
              data-testid="ai-endpoint-input"
            />
            <span className="firo-ai-settings-modal__hint">
              {provider === "ollama"
                ? "Default Ollama HTTP server URL."
                : "Base URL for the OpenAI-compatible completions API."}
            </span>
          </div>

          {/* Model Name */}
          <div className="firo-ai-settings-modal__field">
            <label
              htmlFor="ai-model-input"
              className="firo-ai-settings-modal__label"
            >
              Model Name
            </label>
            <input
              id="ai-model-input"
              type="text"
              className="firo-ai-settings-modal__input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="llama3:8b"
              data-testid="ai-model-input"
            />
            <span className="firo-ai-settings-modal__hint">
              The tag or name of the pulled local model (e.g. llama3:8b,
              mistral, phi3, qwen2.5).
            </span>
          </div>

          {/* API Key (Optional) */}
          <div className="firo-ai-settings-modal__field">
            <label
              htmlFor="ai-apikey-input"
              className="firo-ai-settings-modal__label"
            >
              API Key (Optional)
            </label>
            <input
              id="ai-apikey-input"
              type="password"
              className="firo-ai-settings-modal__input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Leave blank for unauthenticated local endpoints"
              data-testid="ai-apikey-input"
            />
            <span className="firo-ai-settings-modal__hint">
              Optional bearer token for secured private or self-hosted proxies.
            </span>
          </div>

          {/* Connection Test Section */}
          <div className="firo-ai-settings-modal__test-section">
            <div className="firo-ai-settings-modal__test-row">
              <button
                type="button"
                className="firo-ai-settings-modal__btn firo-ai-settings-modal__btn--secondary"
                onClick={handleTestConnection}
                disabled={pingStatus === "testing"}
                data-testid="ai-test-connection-btn"
              >
                {pingStatus === "testing" ? "Testing..." : "Test Connection"}
              </button>

              {pingStatus === "success" && (
                <span
                  className="firo-ai-settings-modal__status firo-ai-settings-modal__status--success"
                  data-testid="ai-status-success"
                >
                  <CheckIcon size={16} /> Reachable
                </span>
              )}
              {pingStatus === "error" && (
                <span
                  className="firo-ai-settings-modal__status firo-ai-settings-modal__status--error"
                  data-testid="ai-status-error"
                >
                  Connection Failed
                </span>
              )}
            </div>

            {pingMessage && (
              <span
                className={`firo-ai-settings-modal__hint ${
                  pingStatus === "error"
                    ? "firo-ai-settings-modal__status--error"
                    : pingStatus === "success"
                    ? "firo-ai-settings-modal__status--success"
                    : ""
                }`}
                data-testid="ai-status-message"
              >
                {pingMessage}
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="firo-ai-settings-modal__footer">
          <button
            type="button"
            className="firo-ai-settings-modal__btn firo-ai-settings-modal__btn--secondary"
            onClick={onClose}
            data-testid="ai-cancel-btn"
          >
            Cancel
          </button>
          <button
            type="button"
            className="firo-ai-settings-modal__btn firo-ai-settings-modal__btn--primary"
            onClick={handleSave}
            data-testid="ai-save-btn"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
