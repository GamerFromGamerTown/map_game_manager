import type { GameState } from "../types";
import { normalizeLoadedState } from "./migrations";
import { importGameStateArchiveBytes } from "./saveArchive";
import { parseGameStateJson } from "./validation";

export type SaveFileKind = "archive" | "legacy-json";

export interface LoadedGameSave {
  state: GameState;
  format: SaveFileKind;
  formatLabel: string;
  warnings: string[];
}

const decoder = new TextDecoder();

const hasZipMagic = (bytes: Uint8Array): boolean =>
  bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

const legacyJsonWarnings = (state: GameState): string[] => {
  const aliasCount = state.countries.reduce(
    (sum, country) => sum + (country.short_name ? 1 : 0) + (country.aliases?.length ?? 0),
    0
  );
  return [
    "Imported a legacy monolithic JSON save. Export it as a structured save archive to persist aliases and domains separately.",
    ...(aliasCount === 0
      ? [
          "Legacy save contains no country/player aliases. Discord alias-only references will block until aliases are added and saved in an archive."
        ]
      : [])
  ];
};

export const inferSaveFileKind = (file: File): SaveFileKind => {
  const lowerName = file.name.toLowerCase();
  if (
    lowerName.endsWith(".gm-save.zip") ||
    lowerName.endsWith(".gmarchive") ||
    lowerName.endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  ) {
    return "archive";
  }
  if (lowerName.endsWith(".json") || file.type === "application/json") return "legacy-json";
  throw new Error("Unsupported save file type. Choose a structured save archive or legacy .json backup file.");
};

export const loadGameSaveFromBytes = (bytes: Uint8Array, fileName = ""): LoadedGameSave => {
  const lowerName = fileName.toLowerCase();
  const isArchive =
    hasZipMagic(bytes) ||
    lowerName.endsWith(".gm-save.zip") ||
    lowerName.endsWith(".gmarchive") ||
    lowerName.endsWith(".zip");

  if (isArchive) return importGameStateArchiveBytes(bytes);

  const state = normalizeLoadedState(parseGameStateJson(decoder.decode(bytes)));
  return {
    state,
    format: "legacy-json",
    formatLabel: "Legacy JSON backup",
    warnings: legacyJsonWarnings(state)
  };
};

export const loadGameSaveFromFile = async (file: File): Promise<LoadedGameSave> => {
  inferSaveFileKind(file);
  return loadGameSaveFromBytes(new Uint8Array(await file.arrayBuffer()), file.name);
};

export const loadGameStateFromFile = async (file: File): Promise<GameState> => {
  return (await loadGameSaveFromFile(file)).state;
};
