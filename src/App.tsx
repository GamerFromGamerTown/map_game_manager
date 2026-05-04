import { CSSProperties, useEffect, useMemo, useState } from "react";
import {
  Database,
  Eye,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sun
} from "lucide-react";
import { Country, Factory, GameState, Settlement } from "./types";
import starterGameJson from "./data/starter_game.json";
import { normalizeLoadedState } from "./data/migrations";
import { commitTurn, previewNextTurn } from "./engine/calculations";
import { downloadBytes, exportStateAsSqlite } from "./db/sqlite";
import { parseGameStateJson, validateGameState } from "./data/validation";
import { Dashboard } from "./components/Dashboard";
import { CountrySheet, CountryTab } from "./components/CountrySheet";
import { RuleSection, RulesEditor } from "./components/RulesEditor";
import { DiplomacyGraph } from "./components/DiplomacyGraph";
import { DiceRoller } from "./components/DiceRoller";
import { ExportImportControls } from "./components/ExportImportControls";
import { CountryOnboardingModal } from "./components/modals/CountryOnboardingModal";
import { Modal } from "./ui/fields";
import { NormalizedWarning, normalizePreviewWarnings } from "./ui/warningModel";
import { buildTurnTransactionSummary } from "./ui/turnTransaction";
import { TurnPreviewDiff } from "./components/TurnPreviewDiff";
import "./styles.css";

const STORAGE_KEY = "gm-economy-console-state";
const THEME_KEY = "gm-economy-console-theme-v2";

type View = "dashboard" | "country" | "dice" | "graph" | "rules";
type Theme = "light" | "dark";

const loadInitialState = (): GameState => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return normalizeLoadedState(validateGameState(starterGameJson));
  try {
    return normalizeLoadedState(parseGameStateJson(saved));
  } catch {
    return normalizeLoadedState(validateGameState(starterGameJson));
  };
};

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
  const [rulesSection, setRulesSection] = useState<RuleSection>("settings");
  const [gmNotes, setGmNotes] = useState("");
  const [creatingCountry, setCreatingCountry] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [countryFilter, setCountryFilter] = useState("");
  const [commandSearch, setCommandSearch] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [focusTargetId, setFocusTargetId] = useState("");
  const preview = useMemo(() => previewNextTurn(state), [state]);
  const warnings = useMemo(() => normalizePreviewWarnings(state, preview), [state, preview]);
  const transactionSummary = useMemo(
    () => buildTurnTransactionSummary(state, preview, overrideReason),
    [state, preview, overrideReason]
  );
  const selectedCountry = state.countries.find((country) => country.id === selectedCountryId) ?? state.countries[0];
  const filteredCountries = state.countries.filter((country) =>
    country.name.toLowerCase().includes(countryFilter.trim().toLowerCase())
  );
  const shellStyle = { "--rail-width": railCollapsed ? "76px" : "300px" } as CSSProperties;

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state]);
  useEffect(() => localStorage.setItem(THEME_KEY, theme), [theme]);

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
      if (!target) {
        window.clearInterval(timer);
        return;
      }
      target.scrollIntoView({ block: "center", inline: "nearest" });
      if (target instanceof HTMLElement) {
        target.focus({ preventScroll: true });
        target.classList.add("focus-pulse");
        window.setTimeout(() => target.classList.remove("focus-pulse"), 1300);
      }
      setFocusTargetId("");
      window.clearInterval(timer);
    }, 80);
    return () => window.clearInterval(timer);
  }, [countryTab, focusTargetId, rulesSection, selectedCountryId, view]);

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

  const openWarning = (warning: NormalizedWarning) => {
    if (warning.target.view === "country" && warning.target.countryId) {
      setSelectedCountryId(warning.target.countryId);
      setCountryTab(warning.target.countryTab ?? "Overview");
      setView("country");
    } else if (warning.target.view === "rules") {
      if (warning.target.rulesSection) setRulesSection(warning.target.rulesSection);
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
    const summary = buildTurnTransactionSummary(state, previewNextTurn(state), overrideReason);
    if (!summary.canCommit) return;
    const notes = [gmNotes.trim(), summary.overrideReason ? `Warning override: ${summary.overrideReason}` : ""]
      .filter(Boolean)
      .join("\n");
    patchState((current) => commitTurn(current, previewNextTurn(current), notes));
    setGmNotes("");
    setOverrideReason("");
    setReviewOpen(false);
   };

  const exportSqlite = async () => {
    const bytes = await exportStateAsSqlite(state);
    downloadBytes(bytes, `gm-game-turn-${state.turnNumber}.sqlite`, "application/x-sqlite3");
   };

  const runCommandSearch = () => {
    const query = commandSearch.trim().toLowerCase();
    if (!query) return;
    const country = state.countries.find((item) => item.name.toLowerCase().includes(query));
    if (country) {
      setSelectedCountryId(country.id);
      setView("country");
      return;
    }
    const ruleMap: Array<[string, RuleSection]> = [
      ["settings", "settings"],
      ["settlement", "settlementTiers"],
      ["resource", "resourceProduction"],
      ["factory", "factoryRules"],
      ["policy", "policyCategories"],
      ["ruling", "rulingParties"],
      ["stability", "stabilityRules"],
      ["diplomacy", "diplomacyRelationTypes"],
      ["puppet", "puppetTypes"],
      ["dice", "dice"]
    ];
    const rule = ruleMap.find(([label]) => query.includes(label));
    if (rule) {
      setRulesSection(rule[1]);
      setView("rules");
      return;
    }
    if (query.includes("warning") || query.includes("preview") || query.includes("commit")) setView("dashboard");
   };

  return (
    <div className={`app-shell theme-${theme} ${railCollapsed ? "rail-collapsed" : ""}`} style={shellStyle}>
      <aside className="sidebar" aria-label="Application navigation">
        <div className="brand">
          <Database size={22} />
          <div className="rail-text">
            <strong>GM Economy Console</strong>
            <span>Turn {state.turnNumber}</span>
          </div>
          <button
            className="icon rail-toggle"
            aria-label={railCollapsed ? "Expand navigation rail" : "Collapse navigation rail"}
            onClick={() => setRailCollapsed((current) => !current)}
          >
            {railCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        <nav aria-label="Primary">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
            <span className="rail-text">Dashboard</span>
            <span className="rail-abbr">Dash</span>
          </button>
          <button className={view === "dice" ? "active" : ""} onClick={() => setView("dice")}>
            <span className="rail-text">Dice Roller</span>
            <span className="rail-abbr">Dice</span>
          </button>
          <button className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}>
            <span className="rail-text">Diplomacy Graph</span>
            <span className="rail-abbr">Graph</span>
          </button>
          <button className={view === "rules" ? "active" : ""} onClick={() => setView("rules")}>
            <span className="rail-text">Rules Editor</span>
            <span className="rail-abbr">Rules</span>
          </button>
        </nav>
        <label className="country-filter rail-text">
          <span>Find country</span>
          <input value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} placeholder="Search countries" />
        </label>
        <div className="country-list" aria-label="Countries">
          {filteredCountries.map((country) => (
            <button
              key={country.id}
              className={country.id === selectedCountryId && view === "country" ? "country-chip active" : "country-chip"}
              title={country.name}
              aria-label={country.name}
              onClick={() => {
                setSelectedCountryId(country.id);
                setView("country");
              }}
            >
              <span className="country-chip-swatch" style={{ background: country.color }} />
              <span className="country-chip-label">{country.name}</span>
            </button>
          ))}
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div className="topbar-title">
            <h1>{view === "country" ? selectedCountry?.name : titleForView(view)}</h1>
            <p>
              {transactionSummary.unresolvedBlockers.length} blockers, {warnings.length} active warnings
            </p>
          </div>
          <div className="command-search">
            <Search size={16} />
            <input
              aria-label="Command search"
              list="command-options"
              value={commandSearch}
              onChange={(event) => setCommandSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") runCommandSearch();
              }}
              placeholder="Search countries, rules, warnings"
            />
            <datalist id="command-options">
              {state.countries.map((country) => (
                <option value={country.name} key={country.id} />
              ))}
              <option value="Factory rules" />
              <option value="Policy rules" />
              <option value="Warnings" />
              <option value="Turn preview" />
            </datalist>
          </div>
          <div className="actions topbar-secondary">
            <button onClick={() => setCreatingCountry(true)}>
              <Plus size={16} /> Country
            </button>
            <button className="undo-button" onClick={undo} disabled={history.length === 0}>
              <RotateCcw size={16} /> Undo
            </button>
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />} Theme
            </button>
            <button onClick={() => setReviewOpen(true)}>
              <Eye size={16} /> Preview Turn
            </button>
            <ExportImportControls state={state} setState={setTrackedState} exportSqlite={exportSqlite} />
          </div>
          <button className="primary commit-button" onClick={() => setReviewOpen(true)}>
            <Save size={16} /> Commit Turn
          </button>
        </header>

        <section className="gm-notes-line">
          <label>
            <span>Commit notes</span>
            <input value={gmNotes} onChange={(event) => setGmNotes(event.target.value)} placeholder="GM notes for next commit" />
          </label>
        </section>

        {view === "dashboard" && (
          <Dashboard
            state={state}
            preview={preview}
            warnings={warnings}
            transactionSummary={transactionSummary}
            onOpenWarning={openWarning}
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
        {view === "rules" && (
          <RulesEditor state={state} patchState={patchState} active={rulesSection} setActive={setRulesSection} />
        )}
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

      {reviewOpen && (
        <Modal
          title="Turn Transaction Review"
          onClose={() => setReviewOpen(false)}
          footer={
            <>
              <button onClick={() => setReviewOpen(false)}>Close</button>
              <button className="primary" disabled={!transactionSummary.canCommit} onClick={commit}>
                <Save size={16} /> Confirm Commit
              </button>
            </>
          }
        >
          <div className="commit-gate">
            <label>
              <span>Commit notes</span>
              <input
                value={gmNotes}
                onChange={(event) => setGmNotes(event.target.value)}
                placeholder="Notes saved to every turn log"
              />
            </label>
            {transactionSummary.unresolvedBlockers.length > 0 && (
              <label>
                <span>Override reason required for blockers</span>
                <textarea
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  placeholder="Explain why this turn can be committed with unresolved blockers"
                />
              </label>
            )}
          </div>
          <TurnPreviewDiff summary={transactionSummary} state={state} onOpenWarning={openWarning} />
        </Modal>
      )}
    </div>
  );
}

export default App;
