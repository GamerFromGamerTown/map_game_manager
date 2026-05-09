import { Country, Factory, GameState, Settlement, TurnPreview } from "../types";
import { NormalizedWarning } from "../ui/warningModel";
import { WarningQueue } from "./WarningQueue";
import { OverviewTab } from "./country/OverviewTab";
import { SettlementsTab } from "./country/SettlementsTab";
import { FactoriesTab } from "./country/FactoriesTab";
import { ResourcesTab } from "./country/ResourcesTab";
import { PoliciesTab } from "./country/PoliciesTab";
import {
  DiplomacyTab,
  DiceLogTab,
  MilitaryTab,
  PuppetsTab,
  TradeTab,
  TurnHistoryTab
} from "./country/OtherTabs";

export type CountryTab =
  | "Overview"
  | "Settlements"
  | "Production"
  | "Factories"
  | "Policies"
  | "Trade/Diplomacy"
  | "Military"
  | "Dice/History";

const countryTabs: CountryTab[] = [
  "Overview",
  "Settlements",
  "Production",
  "Factories",
  "Trade/Diplomacy",
  "Military",
  "Dice/History",
  "Policies"
];

const tabsWithAddActions = new Set<CountryTab>(["Settlements", "Factories", "Trade/Diplomacy", "Military"]);

export function CountrySheet({
  state,
  preview,
  country,
  activeTab,
  setActiveTab,
  patchState,
  updateCountry,
  updateSettlement,
  updateFactory,
  warnings,
  onOpenWarning
}: {
  state: GameState;
  preview: TurnPreview;
  country: Country;
  activeTab: CountryTab;
  setActiveTab: (tab: CountryTab) => void;
  patchState: (updater: (current: GameState) => GameState) => void;
  updateCountry: (id: string, patch: Partial<Country>) => void;
  updateSettlement: (id: string, patch: Partial<Settlement>) => void;
  updateFactory: (id: string, patch: Partial<Factory>) => void;
  warnings: NormalizedWarning[];
  onOpenWarning: (warning: NormalizedWarning) => void;
}) {
  const item = preview.countries.find((row) => row.countryId === country.id);

  return (
    <section className="panel full country-sheet" id={`country-${country.id}-overview`} tabIndex={-1}>
      <div className="country-page-header">
        <div>
          <h2>{country.name}</h2>
          <p className="quiet">{warnings.length} active warnings for this country.</p>
        </div>
        {warnings.length > 0 && (
          <div className="country-warning-summary">
            <strong>{warnings.filter((warning) => warning.severity === "error").length}</strong>
            <span>blockers</span>
          </div>
        )}
      </div>

      <div className="tabs country-tabs" role="tablist" aria-label="Country workflows">
        {countryTabs.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            <span>{tab}</span>
            {tabsWithAddActions.has(tab) && <span className="tab-plus"> +</span>}
          </button>
        ))}
      </div>

      {warnings.length > 0 && (
        <section className="country-warning-panel">
          <WarningQueue warnings={warnings} state={state} onOpenWarning={onOpenWarning} compact />
        </section>
      )}

      {activeTab === "Overview" && (
        <OverviewTab state={state} country={country} preview={item} patchState={patchState} updateCountry={updateCountry} />
      )}
      {activeTab === "Settlements" && (
        <SettlementsTab state={state} country={country} updateSettlement={updateSettlement} patchState={patchState} />
      )}
      {activeTab === "Production" && (
        <section className="workflow-section">
          <div className="section-heading">
            <h2>Resource stockpiles</h2>
          </div>
          <ResourcesTab state={state} country={country} preview={item} patchState={patchState} />
        </section>
      )}
      {activeTab === "Factories" && (
        <section className="workflow-section">
          <div className="section-heading">
            <h2>Factories</h2>
          </div>
          <FactoriesTab state={state} country={country} updateFactory={updateFactory} patchState={patchState} />
        </section>
      )}
      {activeTab === "Policies" && <PoliciesTab state={state} country={country} patchState={patchState} />}
      {activeTab === "Trade/Diplomacy" && (
        <div className="section-stack">
          <section className="workflow-section" id={`trades-${country.id}`} tabIndex={-1}>
            <div className="section-heading">
              <h2>Trade routes</h2>
            </div>
            <TradeTab state={state} country={country} patchState={patchState} />
          </section>
          <section className="workflow-section">
            <div className="section-heading">
              <h2>Diplomacy</h2>
            </div>
            <DiplomacyTab state={state} country={country} patchState={patchState} />
          </section>
          <section className="workflow-section" id={`puppets-${country.id}`} tabIndex={-1}>
            <div className="section-heading">
              <h2>Puppets</h2>
            </div>
            <PuppetsTab state={state} country={country} patchState={patchState} />
          </section>
        </div>
      )}
      {activeTab === "Military" && <MilitaryTab state={state} country={country} patchState={patchState} />}
      {activeTab === "Dice/History" && (
        <div className="section-stack">
          <section className="workflow-section">
            <div className="section-heading">
              <h2>Dice rolls</h2>
            </div>
            <DiceLogTab state={state} country={country} />
          </section>
          <section className="workflow-section">
            <div className="section-heading">
              <h2>Turn history</h2>
            </div>
            <TurnHistoryTab state={state} country={country} />
          </section>
        </div>
      )}
    </section>
  );
}
