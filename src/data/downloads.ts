import type { GameState } from "../types";
import { exportGameStateArchiveBlob } from "./saveArchive";

const downloadBlob = (blob: Blob, filename: string) => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const downloadJson = (state: GameState, filename: string) => {
  downloadBlob(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }), filename);
};

export const downloadSaveArchive = (state: GameState, filename: string) => {
  downloadBlob(exportGameStateArchiveBlob(state), filename);
};

export const downloadText = (text: string, filename: string, type = "text/markdown") => {
  downloadBlob(new Blob([text], { type }), filename);
};
