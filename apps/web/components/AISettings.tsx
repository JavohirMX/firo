import React, { useEffect, useState } from "react";
import { AISettingsModal } from "@firo/ui";

import {
  DEFAULT_AI_CONFIG,
  getAIConfig,
  setAIConfig,
  type AIConfig,
} from "../board/ai";
import {
  AI_AVAILABILITY_EVENT,
  getAIAvailable,
  readAIEnabled,
  setAIEnabled,
} from "../board/aiAvailability";

export const useAIAvailable = () => {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getAIAvailable().then((value) => {
        if (active) {
          setAvailable(value);
        }
      });
    };
    refresh();
    window.addEventListener(AI_AVAILABILITY_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      active = false;
      window.removeEventListener(AI_AVAILABILITY_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return available;
};

export const AISettings = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const [config, setConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);
  useEffect(() => {
    if (isOpen) {
      void getAIConfig().then(setConfig);
    }
  }, [isOpen]);
  return (
    <AISettingsModal
      isOpen={isOpen}
      onClose={onClose}
      config={config}
      enabled={readAIEnabled()}
      onSave={(next) => {
        void setAIConfig(next).then(() => {
          window.dispatchEvent(new Event(AI_AVAILABILITY_EVENT));
        });
      }}
      onEnabledChange={setAIEnabled}
    />
  );
};
