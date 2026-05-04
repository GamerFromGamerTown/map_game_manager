import { useEffect, useMemo, useState } from "react";
import { Database, Moon, Plus, RefreshCw, RotateCcw, Save, Sun } from "lucide-react";
import { Country, Factory, GameState, Settlement } from "./types";
import { createBundledState } from "./data/defaultState";
import { commitTurn, previewNextTurn } from "./engine/calculations";
import { downloadBytes, exportStateAsSqlite } from "./db/sqlite";
import { Dashboard } from "./components/Dashboard";
import { CountrySheet, CountryTab } from "./components/CountrySheet";
import { RulesEditor } from "./components/RulesEditor";
import { DiplomacyGraph } from "./components/DiplomacyGraph";
import { DiceRoller } from "./components/DiceRoller";
import { ExportImportControls } from "./components/ExportImportControls";
import { CountryOnboardingModal } from "./components/modals/CountryOnboardingModal";
import { countryShortName } from "./utils/names";
import "./styles.css";

const THEME_KEY = "gm-economy-console-theme-v2";

type View = "dashboard" | "country" | "dice" | "graph" | "rules";
type Theme = "light" | "dark";

const loadInitialState = (): GameState => createBundledState();

const titleForView = (view: View) => {
  if (view === "dashboard") return "Dashboard";
  if (view === "dice") return "Dice Roller";
  if (view === "graph") return "Diplomacy Graph";
  return "Rules Editor";
};

function App() {
  const [state, setState] = useState<GameState>(loadInitialState);
  const [history, setHistory] = useState<GameState[]>([]);
  const [theme, setTheme] = useState<Theme>((localStorage.getItem(THEME_KEY) as Theme) || "dark");
  const [view, setView] = useState<View>("dashboard");
  const [selectedCountryId, setSelectedCountryId] = useState(state.countries[0]?.id ?? "");
  const [countryTab, setCountryTab] = useState<CountryTab>("Overview");
  const [gmNotes, setGmNotes] = useState("");
  const [creatingCountry, setCreatingCountry] = useState(false);
  const preview = useMemo(() => previewNextTurn(state), [state]);
  const selectedCountry = state.countries.find((country) => country.id === selectedCountryId) ?? state.countries[0];

  useEffect(() => localStorage.setItem(THEME_KEY, theme), [theme]);

  useEffect(() => {
    if (selectedCountryId && state.countries.some((country) => country.id === selectedCountryId)) return;
    setSelectedCountryId(state.countries[0]?.id ?? "");
  }, [selectedCountryId, state.countries]);

  const setTrackedState = (next: GameState) => {
    setHistory((current) => [state, ...current].slice(0, 50));
    setState(next);
  };

  const patchState = (updater: (current: GameState) => GameState) => {
    const next = updater(state);
    if (next !== state) {
      setHistory((stack) => [state, ...stack].slice(0, 50));
      setState(next);
    }
  };

  const undo = () => {
    setHistory((stack) => {
      const [previous, ...rest] = stack;
      if (previous) setState(previous);
      return rest;
    });
  };

  const updateCountry = (id: string, patch: Partial<Country>) =>
    patchState((current) => ({
      ...current,
      countries: current.countries.map((country) => (country.id === id ? { ...country, ...patch } : country))
    }));

  const updateSettlement = (id: string, patch: Partial<Settlement>) =>
    patchState((current) => ({
      ...current,
      settlements: current.settlements.map((settlement) =>
        settlement.id === id ? { ...settlement, ...patch } : settlement
      )
    }));

  const updateFactory = (id: string, patch: Partial<Factory>) =>
    patchState((current) => ({
      ...current,
      factories: current.factories.map((factory) => (factory.id === id ? { ...factory, ...patch } : factory))
    }));

  const commit = () => {
    patchState((current) => commitTurn(current, previewNextTurn(current), gmNotes));
    setGmNotes("");
  };

  const exportSqlite = async () => {
    const bytes = await exportStateAsSqlite(state);
    downloadBytes(bytes, `gm-game-turn-${state.turnNumber}.sqlite`, "application/x-sqlite3");
  };

  return (
    <div className={`app-shell theme-${theme}`}>
      <aside className="sidebar">
        <div className="brand">
          <Database size={22} />
          <div>
            <strong>GM Economy Console</strong>
            <span>Turn {state.turnNumber}</span>
          </div>
        </div>
        <nav>
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>Dashboard</button>
          <button className={view === "dice" ? "active" : ""} onClick={() => setView("dice")}>Dice Roller</button>
          <button className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}>Diplomacy Graph</button>
          <button className={view === "rules" ? "active" : ""} onClick={() => setView("rules")}>Rules Editor</button>
        </nav>
        <div className="country-list">
          {state.countries.map((country) => (
            <button
              key={country.id}
              className={country.id === selectedCountryId && view === "country" ? "country-chip active" : "country-chip"}
              onClick={() => {
                setSelectedCountryId(country.id);
                setView("country");
              }}
            >
              <span style={{ background: country.color }} />
              <strong>{countryShortName(state, country.id)}</strong>
            </button>
          ))}
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div className="topbar-title">
            <h1>{view === "country" ? selectedCountry?.name : titleForView(view)}</h1>
            <p>{preview.globalWarnings.length + preview.countries.reduce((sum, item) => sum + item.warnings.length, 0)} active warnings</p>
          </div>
          <div className="actions topbar-secondary">
            <button onClick={() => setCreatingCountry(true)}><Plus size={16} /> Country</button>
            <button className="danger" onClick={undo} disabled={history.length === 0}><RotateCcw size={16} /> Undo</button>
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />} Theme
            </button>
            <button onClick={() => setView("dashboard")}><RefreshCw size={16} /> Preview</button>
            <ExportImportControls state={state} setState={setTrackedState} exportSqlite={exportSqlite} />
          </div>
          <button className="primary commit-button" onClick={commit}><Save size={16} /> Commit Turn</button>
        </header>

        <section className="gm-notes-line">
          <input value={gmNotes} onChange={(event) => setGmNotes(event.target.value)} placeholder="GM notes for next commit" />
        </section>

        {view === "dashboard" && (
          <Dashboard
            state={state}
            preview={preview}
            onOpenCountry={(id) => {
              setSelectedCountryId(id);
              setView("country");
            }}
          />
        )}
        {view === "country" && selectedCountry && (
          <CountrySheet
            state={state}
            preview={preview}
            country={selectedCountry}
            activeTab={countryTab}
            setActiveTab={setCountryTab}
            patchState={patchState}
            updateCountry={updateCountry}
            updateSettlement={updateSettlement}
            updateFactory={updateFactory}
          />
        )}
        {view === "dice" && <DiceRoller state={state} patchState={patchState} />}
        {view === "graph" && (
          <DiplomacyGraph
            state={state}
            patchState={patchState}
            openCountry={(id) => {
              setSelectedCountryId(id);
              setView("country");
            }}
          />
        )}
        {view === "rules" && <RulesEditor state={state} patchState={patchState} />}
      </main>

      {creatingCountry && (
        <CountryOnboardingModal
          state={state}
          onClose={() => setCreatingCountry(false)}
          onCreate={(next, countryId) => {
            setTrackedState(next);
            setSelectedCountryId(countryId);
            setView("country");
            setCreatingCountry(false);
          }}
        />
      )}
    </div>
  );
}

export default App;
