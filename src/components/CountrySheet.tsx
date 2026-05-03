import { Country, Factory, GameState, Settlement, TurnPreview } from "../types";
import { OverviewTab } from "./country/OverviewTab";
import { SettlementsTab } from "./country/SettlementsTab";
import { FactoriesTab } from "./country/FactoriesTab";
import { ResourcesTab } from "./country/ResourcesTab";
import { PoliciesTab } from "./country/PoliciesTab";
import { DiplomacyTab, DiceLogTab, MilitaryTab, NotesTab, PuppetsTab, TradeTab, TurnHistoryTab } from "./country/OtherTabs";

export type CountryTab =
  | "Overview"
  | "Settlements"
  | "Factories"
  | "Resources"
  | "Policies"
  | "Diplomacy"
  | "Puppets"
  | "Trade"
  | "Military"
  | "Dice Rolls"
  | "Turn History"
  | "Notes";

export const countryTabs: CountryTab[] = [
  "Overview",
  "Settlements",
  "Factories",
  "Resources",
  "Policies",
  "Diplomacy",
  "Puppets",
  "Trade",
  "Military",
  "Dice Rolls",
  "Turn History",
  "Notes"
];

export function CountrySheet({
  state,
  preview,
  country,
  activeTab,
  setActiveTab,
  patchState,
  updateCountry,
  updateSettlement,
  updateFactory
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
}) {
  const item = preview.countries.find((row) => row.countryId === country.id);

  return (
    <section className="panel full country-sheet">
      <div className="tabs">
        {countryTabs.map((tab) => (
          <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>
      {activeTab === "Overview" && <OverviewTab state={state} country={country} preview={item} patchState={patchState} updateCountry={updateCountry} />}
      {activeTab === "Settlements" && <SettlementsTab state={state} country={country} updateSettlement={updateSettlement} patchState={patchState} />}
      {activeTab === "Factories" && <FactoriesTab state={state} country={country} updateFactory={updateFactory} patchState={patchState} />}
      {activeTab === "Resources" && <ResourcesTab state={state} country={country} patchState={patchState} />}
      {activeTab === "Policies" && <PoliciesTab state={state} country={country} patchState={patchState} />}
      {activeTab === "Diplomacy" && <DiplomacyTab state={state} country={country} patchState={patchState} />}
      {activeTab === "Puppets" && <PuppetsTab state={state} country={country} patchState={patchState} />}
      {activeTab === "Trade" && <TradeTab state={state} country={country} patchState={patchState} />}
      {activeTab === "Military" && <MilitaryTab state={state} country={country} patchState={patchState} />}
      {activeTab === "Dice Rolls" && <DiceLogTab state={state} country={country} />}
      {activeTab === "Turn History" && <TurnHistoryTab state={state} country={country} />}
      {activeTab === "Notes" && <NotesTab state={state} country={country} updateCountry={updateCountry} />}
    </section>
  );
}
