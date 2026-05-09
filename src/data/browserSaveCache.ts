import type { GameState } from "../types";
import { normalizeLoadedState } from "./migrations";
import { parseGameStateJson } from "./validation";

const BROWSER_SAVE_CACHE_KEY = "gm-economy-console-current-save-v1";

const canUseLocalStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

export const loadBrowserSaveCache = (): GameState | null => {
  if (!canUseLocalStorage()) return null;

  try {
    const cached = window.localStorage.getItem(BROWSER_SAVE_CACHE_KEY);
    if (!cached) return null;
    return normalizeLoadedState(parseGameStateJson(cached));
  } catch {
    window.localStorage.removeItem(BROWSER_SAVE_CACHE_KEY);
    return null;
  }
};

export const writeBrowserSaveCache = (state: GameState) => {
  if (!canUseLocalStorage()) return;

  try {
    window.localStorage.setItem(BROWSER_SAVE_CACHE_KEY, JSON.stringify(state));
  } catch {
    // Keep the in-memory session usable if the browser rejects or runs out of storage.
  }
};
