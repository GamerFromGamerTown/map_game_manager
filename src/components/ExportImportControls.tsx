import { useRef } from "react";
import { DatabaseBackup, Download, FileJson, ScrollText, Upload } from "lucide-react";
import { GameState } from "../types";
import { downloadJson, downloadText, importStateFromSqliteFile } from "../db/sqlite";
import { normalizeLoadedState } from "../data/migrations";
import { parseGameStateJson } from "../data/validation";
import { renderAllCountryStatSheets } from "../export/statSheets";

export function ExportImportControls({
  state,
  setState,
  exportSqlite
}: {
  state: GameState;
  setState: (state: GameState) => void;
  exportSqlite: () => Promise<void>;
}) {
  const sqliteInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const importJson = async (file?: File) => {
    if (!file) return;
    setState(normalizeLoadedState(parseGameStateJson(await file.text())));
  };

  const importSqlite = async (file?: File) => {
    if (!file) return;
    setState(normalizeLoadedState(await importStateFromSqliteFile(file)));
  };

  return (
    <details className="io-menu">
      <summary>
        <DatabaseBackup size={16} /> Import / Export
      </summary>
      <div className="menu-panel">
        <button onClick={exportSqlite}>
          <Download size={16} /> Export SQLite save
        </button>
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
        <button onClick={() => sqliteInputRef.current?.click()}>
          <Upload size={16} /> Import SQLite save
        </button>
        <button onClick={() => jsonInputRef.current?.click()}>
          <Upload size={16} /> Import JSON backup
        </button>
      </div>
      <input
        ref={sqliteInputRef}
        hidden
        type="file"
        accept=".sqlite,.db,application/x-sqlite3"
        onChange={(event) => importSqlite(event.target.files?.[0])}
      />
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
