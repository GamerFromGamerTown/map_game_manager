import type { GameState } from "../types";
import { normalizeLoadedState } from "./migrations";
import { parseGameStateJson } from "./validation";

export const inferSaveFileKind = (file: File): "json" => {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".json") || file.type === "application/json") return "json";
  throw new Error("Unsupported save file type. Choose a .json backup file.");
};

export const loadGameStateFromFile = async (file: File): Promise<GameState> => {
  inferSaveFileKind(file);
  return normalizeLoadedState(parseGameStateJson(await file.text()));
};
