import { useEffect, useMemo, useState } from "react";
import { Database, Moon, Plus, RefreshCw, RotateCcw, Save, Sun } from "lucide-react";
import { Country, Factory, GameState, Settlement } from "./types";
import { createEmptyState } from "./data/defaultState";
import { loadBrowserSaveCache, writeBrowserSaveCache } from "./data/browserSaveCache";
import { commitTurn, previewNextTurn } from "./engine/calculations";
import {
  canRememberSaveFiles,
  clearRememberedSave,
  getRememberedSave,
  hasRememberedSaveReadPermission,
  pickRememberedSave,
  requestRememberedSaveReadPermission,
  setRememberedSave
} from "./data/rememberedSave";
import type { RememberedSave } from "./data/rememberedSave";
import { loadGameStateFromFile } from "./data/saveFiles";
import { withUpdatedTurn } from "./data/turnTracking";
import { Dashboard } from "./components/Dashboard";
import { CountrySheet, CountryTab } from "./components/CountrySheet";
import { RulesEditor } from "./components/RulesEditor";
import { DiplomacyGraph } from "./components/DiplomacyGraph";
import { DiceRoller } from "./components/DiceRoller";
import { ExportImportControls } from "./components/ExportImportControls";
import { CountryOnboardingModal } from "./components/modals/CountryOnboardingModal";
import { NormalizedWarning, normalizePreviewWarnings } from "./ui/warningModel";
import { countryShortName } from "./utils/names";
import "./styles.css";

const THEME_KEY = "gm-economy-console-theme-v2";

type View = "dashboard" | "country" | "dice" | "graph" | "rules";
type Theme = "light" | "dark";

const loadInitialState = (): GameState => loadBrowserSaveCache() ?? createEmptyState();
const rememberSaveSupported = canRememberSaveFiles();

const titleForView = (view: View) => {
  if (view === "dashboard") return "Dashboard";
  if (view === "dice") return "Dice Roller";
  if (view === "graph") return "Relations Graph";
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
  const [focusTargetId, setFocusTargetId] = useState("");
  const [rememberedSave, setRememberedSaveState] = useState<RememberedSave | null>(null);
  const [rememberedSaveStatus, setRememberedSaveStatus] = useState("");
  const [visibleDiceRollIds, setVisibleDiceRollIds] = useState<string[]>([]);
  const preview = useMemo(() => previewNextTurn(state), [state]);
  const warnings = useMemo(() => normalizePreviewWarnings(state, preview), [state, preview]);
  const selectedCountry = state.countries.find((country) => country.id === selectedCountryId) ?? state.countries[0];

  useEffect(() => localStorage.setItem(THEME_KEY, theme), [theme]);
  useEffect(() => writeBrowserSaveCache(state), [state]);

  useEffect(() => {
    if (!rememberSaveSupported) return;

    let cancelled = false;

    const loadRememberedSave = async () => {
      try {
        const saved = await getRememberedSave();
        if (cancelled || !saved) return;

        setRememberedSaveState(saved);

        if (!(await hasRememberedSaveReadPermission(saved.handle))) {
          setRememberedSaveStatus(`Remembered ${saved.name}. Use Import / Export -> Reload remembered save to grant access.`);
          return;
        }

        const next = await loadGameStateFromFile(await saved.handle.getFile());
        if (cancelled) return;
        setState(next);
        setHistory([]);
        setRememberedSaveStatus(`Loaded remembered save: ${saved.name}`);
      } catch (error) {
        if (!cancelled) {
          setRememberedSaveStatus(error instanceof Error ? error.message : "Could not load the remembered save file.");
        }
      }
    };

    void loadRememberedSave();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedCountryId && state.countries.some((country) => country.id === selectedCountryId)) return;
    setSelectedCountryId(state.countries[0]?.id ?? "");
  }, [selectedCountryId, state.countries]);

  useEffect(() => {
    if (!focusTargetId) return;

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const target = document.getElementById(focusTargetId);
      if (!target && attempts < 12) return;

      window.clearInterval(timer);
      if (!target) {
        setFocusTargetId("");
        return;
      }

      target.scrollIntoView({ block: "center", inline: "nearest" });
      if (target instanceof HTMLElement) {
        target.focus({ preventScroll: true });
      }
      setFocusTargetId("");
    }, 80);

    return () => window.clearInterval(timer);
  }, [countryTab, focusTargetId, selectedCountryId, view]);

  const setTrackedState = (next: GameState) => {
    setHistory((current) => [state, ...current].slice(0, 50));
    setState(next);
  };

  const replaceState = (next: GameState) => {
    setHistory([]);
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
        settlement.id === id ? withUpdatedTurn(settlement, patch, current.turnNumber) : settlement
      )
    }));

  const updateFactory = (id: string, patch: Partial<Factory>) =>
    patchState((current) => ({
      ...current,
      factories: current.factories.map((factory) =>
        factory.id === id ? withUpdatedTurn(factory, patch, current.turnNumber) : factory
      )
    }));

  const openWarning = (warning: NormalizedWarning) => {
    if (warning.target.view === "country" && warning.target.countryId) {
      setSelectedCountryId(warning.target.countryId);
      setCountryTab(warning.target.countryTab ?? "Overview");
      setView("country");
    } else if (warning.target.view === "rules") {
      setView("rules");
    } else if (warning.target.view === "graph") {
      setView("graph");
    } else if (warning.target.view === "dice") {
      setView("dice");
    } else {
      setView("dashboard");
    }

    if (warning.target.focusId) setFocusTargetId(warning.target.focusId);
  };

  const commit = () => {
    patchState((current) => commitTurn(current, previewNextTurn(current), gmNotes));
    setGmNotes("");
  };

  const loadRememberedSave = async (saved: RememberedSave, requestPermission: boolean) => {
    const canRead = requestPermission
      ? await requestRememberedSaveReadPermission(saved.handle)
      : await hasRememberedSaveReadPermission(saved.handle);

    if (!canRead) {
      setRememberedSaveStatus(`Browser permission is needed to reload ${saved.name}.`);
      return;
    }

    setTrackedState(await loadGameStateFromFile(await saved.handle.getFile()));
    setRememberedSaveStatus(`Loaded remembered save: ${saved.name}`);
  };

  const rememberAndImportSave = async () => {
    try {
      const picked = await pickRememberedSave();
      if (!picked) return;

      const saved: RememberedSave = { ...picked, key: "remembered-save" };
      const next = await loadGameStateFromFile(await saved.handle.getFile());
      await setRememberedSave(picked);
      setRememberedSaveState(saved);
      setTrackedState(next);
      setRememberedSaveStatus(`Loaded remembered save: ${saved.name}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRememberedSaveStatus(error instanceof Error ? error.message : "Could not remember and import that save file.");
    }
  };

  const reloadRememberedSave = async () => {
    if (!rememberedSave) return;

    try {
      await loadRememberedSave(rememberedSave, true);
    } catch (error) {
      setRememberedSaveStatus(error instanceof Error ? error.message : "Could not reload the remembered save file.");
    }
  };

  const forgetRememberedSave = async () => {
    try {
      await clearRememberedSave();
      setRememberedSaveState(null);
      setRememberedSaveStatus("Forgot remembered save file.");
    } catch (error) {
      setRememberedSaveStatus(error instanceof Error ? error.message : "Could not forget the remembered save file.");
    }
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
          <button className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}>Relations Graph</button>
          <button className={view === "rules" ? "active" : ""} onClick={() => setView("rules")}>Rules Editor</button>
        </nav>
        <div className="country-list">
          {state.countries.map((country) => (
            <button
              key={country.id}
              className={country.id === selectedCountryId && view === "country" ? "country-chip active" : "country-chip"}
              title={country.name}
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
            <ExportImportControls
              state={state}
              setState={setTrackedState}
              replaceState={replaceState}
              canRememberSave={rememberSaveSupported}
              rememberedSaveName={rememberedSave?.name ?? ""}
              rememberedSaveStatus={rememberedSaveStatus}
              onRememberAndImport={rememberAndImportSave}
              onReloadRememberedSave={reloadRememberedSave}
              onForgetRememberedSave={forgetRememberedSave}
            />
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
            warnings={warnings.filter((warning) => warning.countryId === selectedCountry.id)}
            onOpenWarning={openWarning}
          />
        )}
        {view === "dice" && (
          <DiceRoller
            state={state}
            patchState={patchState}
            visibleRollIds={visibleDiceRollIds}
            setVisibleRollIds={setVisibleDiceRollIds}
          />
        )}
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
