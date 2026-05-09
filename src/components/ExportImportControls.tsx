import { useRef } from "react";
import { DatabaseBackup, FileJson, FolderOpen, ScrollText, Upload } from "lucide-react";
import { GameState } from "../types";
import { downloadJson, downloadText } from "../data/downloads";
import { loadGameStateFromFile } from "../data/saveFiles";
import { renderAllCountryStatSheets } from "../export/statSheets";

export function ExportImportControls({
  state,
  setState,
  canRememberSave,
  rememberedSaveName,
  rememberedSaveStatus,
  onRememberAndImport,
  onReloadRememberedSave,
  onForgetRememberedSave
}: {
  state: GameState;
  setState: (state: GameState) => void;
  canRememberSave: boolean;
  rememberedSaveName: string;
  rememberedSaveStatus: string;
  onRememberAndImport: () => Promise<void>;
  onReloadRememberedSave: () => Promise<void>;
  onForgetRememberedSave: () => Promise<void>;
}) {
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const importJson = async (file?: File) => {
    if (!file) return;
    setState(await loadGameStateFromFile(file));
  };

  return (
    <details className="io-menu">
      <summary>
        <DatabaseBackup size={16} /> Import / Export
      </summary>
      <div className="menu-panel">
        <button onClick={() => downloadJson(state, `gm-game-turn-${state.turnNumber}.json`)}>
          <FileJson size={16} /> Export JSON backup
        </button>
        <button
          onClick={() =>
            downloadText(
              renderAllCountryStatSheets(state, "polished"),
              `gm-stat-sheets-polished-turn-${state.turnNumber}.md`
            )
          }
        >
          <ScrollText size={16} /> Export polished stat sheets
        </button>
        <button
          onClick={() =>
            downloadText(
              renderAllCountryStatSheets(state, "verbatim"),
              `gm-stat-sheets-verbatim-turn-${state.turnNumber}.md`
            )
          }
        >
          <ScrollText size={16} /> Export verbatim stat sheets
        </button>
        <button onClick={() => (canRememberSave ? onRememberAndImport() : jsonInputRef.current?.click())}>
          <Upload size={16} /> Import JSON backup
        </button>
        {canRememberSave && (
          <>
            <button onClick={onReloadRememberedSave} disabled={!rememberedSaveName}>
              <FolderOpen size={16} /> Reload remembered save
            </button>
            <button onClick={onForgetRememberedSave} disabled={!rememberedSaveName}>
              <FolderOpen size={16} /> Forget remembered save
            </button>
          </>
        )}
        {rememberedSaveStatus && <p className="menu-note">{rememberedSaveStatus}</p>}
      </div>
      <input
        ref={jsonInputRef}
        hidden
        type="file"
        accept=".json,application/json"
        onChange={(event) => importJson(event.target.files?.[0])}
      />
    </details>
  );
}
