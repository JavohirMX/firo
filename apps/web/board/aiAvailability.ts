/** AI is opt-in on this device. Configuration alone never enables tools. */
import { getAIConfig, type AIConfig } from "./ai";

export const AI_ENABLED_KEY = "firo:ai:enabled";
export const AI_AVAILABILITY_EVENT = "firo:ai-availability";

export const isAIConfigured = (config: AIConfig): boolean => {
  if (!config.model.trim() || !config.endpoint.trim()) {
    return false;
  }
  try {
    const url = new URL(config.endpoint);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const readAIEnabled = (): boolean => {
  try {
    return localStorage.getItem(AI_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
};

export const setAIEnabled = (enabled: boolean): void => {
  try {
    localStorage.setItem(AI_ENABLED_KEY, String(enabled));
  } catch {
    // Restricted storage must not break the board.
  }
  window.dispatchEvent(new Event(AI_AVAILABILITY_EVENT));
};

export const getAIAvailable = async (): Promise<boolean> =>
  readAIEnabled() && isAIConfigured(await getAIConfig());
