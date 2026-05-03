# Original Product Prompt

Build a local-first GM web app for managing a custom turn-based map game. The app does not need an actual geographic map. It is a state-management, rules-calculation, and GM automation tool.

The app should let the GM create and manage multiple countries, settlements, factories, resources, policies, diplomacy, puppet states, trade routes, military operations, and turn-by-turn calculations.

Use a clean, functional UI. Prioritize correctness, editable rules, auditability, and easy manual overrides over visual polish.

## Tech Requirements

- Build a web app using React + TypeScript.
- Use SQLite as the save format.
- The user must be able to export and import the entire game state as a `.sqlite` database file.
- The app should also support JSON export/import for backups if practical.
- No login system is needed.
- No online backend is required unless absolutely necessary.
- The app should be usable by one GM locally.

## Core Design

- Treat the game as a collection of countries and turn logs.
- Every calculated number should be traceable: show the formula or source modifiers used.
- Do not hardcode all rules directly into UI components. Put rule constants in a rules/config layer so the GM can edit them later.
- Include a GM override system for manual corrections.

## Main App Sections

### 1. Dashboard

- Show all countries in a table.
- Columns: name, gold, income, stability, manpower, manpower cap, reserve, necessities status, wars, puppet/master status, warnings.
- Include "Process Next Turn" and "Preview Next Turn" buttons.

### 2. Country Sheet

For each country, show and edit:

- name
- color
- player/bot status
- ruling party
- gold
- stability
- manpower
- manpower cap
- reserve
- equipment stockpile
- high-quality equipment
- tanks
- supply
- current policies
- settlements
- factories
- resources
- trades
- diplomacy
- puppet/colony status
- notes

### 3. Settlements

Each settlement should have:

- name
- country owner
- tier: village, city, large city, metropole
- capital flag
- biome/resource type
- produced resource
- produced gold
- manpower cap contribution
- manpower gain contribution
- required upkeep resources
- connected transportation status
- occupied/damaged/bombed status
- notes

Settlement rules:

- Village costs 1,000 gold and 5 stability to create.
- Village produces 500 gold per turn.
- Settlement resource production depends on biome/mineral and settlement tier.
- Cities, large cities, and metropoles require upkeep resources.
- If required resources are missing, warn the GM and optionally downgrade the settlement depending on rules settings.
- Capital gives extra gold and has movement restrictions.

### 4. Factories And Constructions

Support these construction types:

- Sawmill
- Iron Parts Factory
- Troop Equipment Factory
- Tank Parts Factory
- Copper Parts Factory
- Electronics Factory
- Tank Electronics Factory
- Tank Assembly Factory
- Aluminium Parts Factory
- Aluminium Factory
- Bauxite Smeltery
- Gold Factory
- Bank
- Luxuries Factory
- Fine Machinery Factory
- Large Equipment Factory
- Advanced Machinery Factory
- High Quality Equipment Factory
- Supply Factory
- Coastal Fort
- Fortification
- Trenchline
- Canal
- Wall
- Harbour
- Railway
- Bridge
- Large Static Artillery Piece

Each construction should have:

- owner country
- location/linked settlement if applicable
- build cost
- upkeep inputs
- outputs
- damaged/bombed status
- active/inactive status
- notes

Factories should only produce if their input resources are available. If inputs are missing, show a warning and do not produce output for that turn.

### 5. Resources

Track stockpiles and per-turn production/consumption for:

- food
- wood
- plank
- coal
- iron
- iron parts
- bauxite
- aluminium
- aluminium parts
- copper
- copper parts
- gold ore
- gold ingot
- equipment
- high-quality equipment
- fine machinery
- tank parts
- tank electronics
- tanks
- necessities
- supply

Normalize spelling internally. For example, use `aluminium_parts` consistently even if the rules text says "alluminum."

### 6. Policies And Ruling Parties

Support ruling parties:

- Authoritarian
- Democratic
- Monarchy
- Council
- Anarchism

Support policies:

- Population Growth
- Market Type
- Immigration Laws
- Economical Focus
- Living Conditions
- Healthcare
- Business Scale
- Segregation
- Welfare
- Protest Rights
- Judicial Rights
- Worker's Rights
- Military Service
- Infrastructure
- Education
- Press Rights

Each policy option should define:

- gold modifier per turn
- manpower modifier per turn
- stability modifier per turn
- stability cost to switch
- whether it can be forced by a master country
- whether forced cost is halved
- notes

The app should enforce "one change per policy per turn" unless the GM overrides it.

### 7. Stability

Calculate:

- base stability gain
- ruling party stability modifiers
- policy stability modifiers
- necessities effect
- peace bonus
- war effects
- settlement loss/recapture effects
- capital loss/recapture effects
- guarantee effects
- non-aggression pact breaking effects
- puppet rebellion effects

Stability is capped at 100 unless a ruling party modifies the cap. Show revolt risk based on stability bands.

### 8. Manpower And Necessities

Calculate:

- manpower gain per turn
- manpower cap
- reserve cap = manpower cap x 2
- necessities required = floor or threshold based on one necessity per 50,000 manpower cap, according to the rules setting
- necessities produced
- whether necessities are met
- stability effect from necessities

The app should flag whether the current country has enough necessities.

### 9. Diplomacy

Support these relation types:

- war
- military alliance
- economic alliance
- defensive pact
- non-aggression pact
- guarantee
- embargo
- harbour access
- railway access
- troop passthrough authorization
- troop movement authorization
- coastal fort protection
- puppet/master relation

Diplomacy should support automatic consequences:

- military alliance joins wars automatically;
- defensive pact joins only when one side is attacked;
- declaring war on a puppet also declares war on the master;
- embargo cuts trade;
- breaking non-aggression pact costs stability;
- adding/removing guarantees affects stability.

### 10. Puppet And Colony System

Support puppet types:

- Integrated Territories
- Occupied Territories
- Semi-Autonomous State
- Colony
- Protectorate

Each puppet relation should store:

- master country
- puppet country
- puppet type
- gold tribute percentage
- whether diplomacy is inherited from master
- whether color changes
- what actions master can perform
- autonomy notes
- rebellion immunity turns
- custom protectorate tribute percentage if applicable

Calculate tribute automatically each turn and show both puppet loss and master gain.

### 11. Trade And Transportation

Support trade routes:

- sender
- receiver
- resource/gold amount
- recurring or instant
- route type: road, railway, sea
- sea transport cost if applicable
- active/inactive
- blocked by embargo
- notes

Transportation can be abstract. The GM should be able to manually mark a route as valid or invalid rather than requiring a map.

### 12. Military And Operations

Support:

- normal troops
- high-quality troops
- tank troops
- equipment stockpiles
- supply
- offensive operations
- defensive operations
- troop creation
- overseas troop movement cost

Operations should store:

- name
- attacker
- defender
- type: GPO, Spearhead, Encirclement, Tank Breakthrough, Defensive Operation, Stalling Operation
- troops committed
- troop types committed
- supply tier required
- supply allocated
- terrain modifiers
- status
- notes

The app does not need to simulate the actual front line. It should help the GM track operation requirements, supply penalties, dice rolls, and outcomes.

### 13. Dice-Roll Helper

Create a dice roller for combat and expansion.

It should support:

- D20 random roll
- manual roll input
- terrain modifier
- river/water modifier
- uphill/cliff/mountain modifier
- tank modifier
- high-quality troop modifier
- supply shortage modifier
- fortification/wall/trench modifier
- encirclement modifier
- custom GM modifier
- final result
- result category

Result bands:

- 1-5: fail
- 6-9: minor victory
- 10-14: victory
- 15-19: big victory
- 20+: huge victory

Save every roll to a log with country, operation, modifiers, result, and notes.

### 14. Diplomacy Graph

Create a draggable node graph:

- each country is a node;
- relation types are edges;
- edge appearance depends on relation type;
- nodes can be moved manually;
- graph layout is saved in the database;
- clicking a country opens its country sheet;
- clicking a relation opens its diplomacy record.

### 15. Turn Processor

Implement a preview mode and a commit mode.

Preview Next Turn should show:

- projected gold
- projected resources
- projected manpower
- projected stability
- factory shortages
- settlement upkeep shortages
- trade failures
- puppet tribute
- revolt risks
- warnings

Commit Next Turn should:

- apply all changes;
- increment turn number;
- save a permanent turn log;
- save formulas and modifier explanations;
- allow GM notes.

### 16. Rules Editor

Add a Rules Editor where the GM can edit:

- settlement costs
- settlement outputs
- settlement upkeep
- manpower values
- factory costs
- factory inputs/outputs
- stability bands
- policy effects
- ruling party effects
- dice modifiers
- resource names
- puppet tribute values

This is important because the rules may change and some rule text is inconsistent.

### 17. Warnings And Validation

The app should warn the GM about:

- negative resources
- missing factory inputs
- missing settlement upkeep
- invalid policy changes
- country below revolt-risk stability
- impossible diplomacy, such as non-aggression pact and war at same time
- embargo blocking active trade
- puppet rebellion eligibility
- no capital despite having 5+ settlements
- capital moved while at war
- troops created without enough manpower/equipment
- tanks used in mountain/cliff terrain

### 18. Manual Override And Audit Log

Every important value should be manually overrideable by the GM.

Overrides should require:

- value changed
- old value
- new value
- reason/note
- turn number
- timestamp

Do not silently overwrite state. Preserve an audit log.

### 19. Seed Data

Include starter seed data from this country sheet:

Country:

- Gold: 19,500
- Stability: 53
- Ruling Party: Democratic
- Manpower: 16,000
- Manpower cap: 68,000
- Reserve: 0 / 136,000
- Equipment stockpile: 0
- Necessities: 0 / 1
- Settlements: 14 villages
- Food villages: 10, each producing 2 food because Agricultural focus doubles food
- Coal villages: 4, each producing 1 coal according to the current datasheet
- Current gold income: 17,000
- Current manpower gain: 16,000
- Policies:
  - Market Type: Mixed Market
  - Economical Focus: Agricultural
  - Living Conditions: Low Regulations
  - Business Scale: Mixed Focus
  - Segregation: Illegal
  - Infrastructure: Private Investment
  - Press Rights: Regulated
  - all others at base values
- Diplomacy:
  - Defensive pact with Elf
  - Non-aggression pact with Elf
  - Guarantee: Elf

### 20. UI Expectations

Use a practical GM interface:

- tables
- editable forms
- tabs
- warning panels
- formula breakdowns
- import/export buttons
- turn history
- diplomacy graph
- dice roller modal

Avoid excessive animations or decorative UI.

### 21. Deliverables

Produce:

- complete source code;
- database schema;
- rule configuration file;
- seed data;
- instructions for running locally;
- instructions for exporting/importing the SQLite save file;
- a brief explanation of the calculation architecture.

Acceptance criteria:

- The GM can create countries.
- The GM can add settlements and factories.
- The app calculates income, resources, manpower, necessities, and stability.
- The GM can preview and commit turns.
- The GM can save and reload the game state.
- The GM can edit rules without changing code.
- The GM can view diplomacy as a draggable graph.
- The GM can use the dice helper with modifiers.
- The app preserves a turn-by-turn audit log.
