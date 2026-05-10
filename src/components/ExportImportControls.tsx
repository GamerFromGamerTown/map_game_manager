import { useRef, useState } from "react";
import { DatabaseBackup, FileJson, FolderOpen, ScrollText, Upload } from "lucide-react";
import { GameState } from "../types";
import { downloadJson, downloadSaveArchive, downloadText } from "../data/downloads";
import { loadGameSaveFromFile } from "../data/saveFiles";
import { renderAllCountryStatSheets } from "../export/statSheets";
import { applyStatSheetImport } from "../import/statSheetImport";

const DISCORD_STAT_SHEET_ENDPOINT = "/api/import/discord-stat-sheets";

export function ExportImportControls({
  state,
  setState,
  replaceState,
  canRememberSave,
  rememberedSaveName,
  rememberedSaveStatus,
  onRememberAndImport,
  onReloadRememberedSave,
  onForgetRememberedSave
}: {
  state: GameState;
  setState: (state: GameState) => void;
  replaceState: (state: GameState) => void;
  canRememberSave: boolean;
  rememberedSaveName: string;
  rememberedSaveStatus: string;
  onRememberAndImport: () => Promise<void>;
  onReloadRememberedSave: () => Promise<void>;
  onForgetRememberedSave: () => Promise<void>;
}) {
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [statSheetStatus, setStatSheetStatus] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  const importJson = async (file?: File) => {
    if (!file) return;
    try {
      const loaded = await loadGameSaveFromFile(file);
      setState(loaded.state);
      setSaveStatus(
        [
          `Imported ${loaded.formatLabel}.`,
          ...loaded.warnings.map((warning) => `Warning: ${warning}`)
        ].join(" ")
      );
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Could not import that save file.");
    }
  };

  const importDiscordStatSheets = async () => {
    const confirmed = window.confirm(
      "Importing Discord stat sheets will reset your current state, turn/action tracking, and unsaved edits. This import is not undo-able. Continue?"
    );
    if (!confirmed) return;

    setStatSheetStatus("Fetching Discord stat sheets through the local dev server...");
    try {
      const response = await fetch(DISCORD_STAT_SHEET_ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json" }
      });
      const text = await response.text();
      let payload: unknown;
      try {
        payload = text ? (JSON.parse(text) as unknown) : undefined;
      } catch {
        setStatSheetStatus(
          !response.ok || response.status === 404
            ? "Local Discord import endpoint is unavailable. Start the app with npm run dev and use the Vite dev server."
            : "Discord stat-sheet import failed: the local endpoint returned malformed JSON."
        );
        return;
      }

      if (!response.ok) {
        const serverMessage =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "";
        const fallback =
          response.status === 404
            ? "Local Discord import endpoint is unavailable. Start the app with npm run dev and use the Vite dev server."
            : "Discord stat-sheet import failed on the local dev server.";
        setStatSheetStatus(serverMessage || fallback);
        return;
      }

      const result = applyStatSheetImport(state, payload);
      const firstError = result.report.errors[0];
      if (!result.applied) {
        setStatSheetStatus(
          firstError
            ? `Discord stat-sheet parsing blocked: ${firstError.message} Fix: ${firstError.suggestedFix}`
            : "Discord stat-sheet parsing blocked: the fetched bundle could not be applied."
        );
        return;
      }

      replaceState(result.state);
      const warningCount = result.report.warnings.length;
      setStatSheetStatus(
        warningCount > 0
          ? `Imported Discord stat sheets for ${result.state.countries.length} countries with ${warningCount} parser warnings.`
          : `Imported Discord stat sheets for ${result.state.countries.length} countries.`
      );
    } catch {
      setStatSheetStatus(
        "Local Discord import endpoint is unavailable. Start the app with npm run dev and check the dev server console."
      );
    }
  };

  const savedAliasCount = state.countries.reduce(
    (sum, country) => sum + (country.short_name ? 1 : 0) + (country.aliases?.length ?? 0),
    0
  );

  return (
    <details className="io-menu">
      <summary>
        <DatabaseBackup size={16} /> Import / Export
      </summary>
      <div className="menu-panel">
        <button onClick={() => downloadSaveArchive(state, `gm-game-turn-${state.turnNumber}.gm-save.zip`)}>
          <FileJson size={16} /> Export save archive
        </button>
        <button onClick={() => downloadJson(state, `gm-game-turn-${state.turnNumber}.json`)}>
          <FileJson size={16} /> Export legacy JSON backup
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
          <Upload size={16} /> Import save archive / JSON backup
        </button>
        <button onClick={() => void importDiscordStatSheets()}>
          <Upload size={16} /> Import from Discord stat sheets
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
        {saveStatus && <p className="menu-note">{saveStatus}</p>}
        <p className="menu-note">
          {savedAliasCount > 0
            ? `${savedAliasCount} saved alias/short-name references loaded for Discord imports.`
            : "No saved aliases loaded; Discord alias-only references will block until a save archive with aliases is imported."}
        </p>
        {statSheetStatus && <p className="menu-note">{statSheetStatus}</p>}
      </div>
      <input
        ref={jsonInputRef}
        hidden
        type="file"
        accept=".gm-save.zip,.gmarchive,.zip,.json,application/zip,application/json"
        onChange={(event) => {
          void importJson(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
    </details>
  );
}
