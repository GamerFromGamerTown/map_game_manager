# Turn Preview Action Groups Design

## Goal

Replace the current turn preview formula dump with a GM-facing review of actions taken during the current turn. The main preview should answer "what did players do this turn?" before showing calculated economy effects.

## Current Context

`previewNextTurn` remains the source calculation path for turn processing. `Dashboard.tsx` currently renders each country as a collapsible formula breakdown, which is too much like a resource spreadsheet and does not highlight player actions.

The app has some current-turn metadata already:

- Expansion rolls are stored in `diceRolls` with `turn_number` and `roll_type`.
- Policy selections store `last_changed_turn`.
- Countries store `current_turn_created`.

Settlements, factories, trades, diplomacy, puppets, and military operations do not currently have enough save-backed metadata to reliably identify current-turn creation or edits after refresh/import.

## Design

The dashboard turn preview becomes an action review with action-type sections:

- Expansion
- Settlements
- Factories
- Policies
- Trade
- Diplomacy and puppets
- Military

Each section contains concise cards for current-turn actions. The cards should include enough detail to be useful without opening raw JSON or formula trees:

- Expansion cards show roll count, terrain mix, result mix, and gold cost.
- Settlement cards show created count, tier mix, output mix such as `2 food, 1 wood, 1 iron`, capital count, and edited fields when existing settlements changed.
- Factory cards show created count, type mix, output mix, input mix, active count, damaged/bombed count, and edited fields when existing factories changed.
- Policy cards show changed policy categories and the selected options.
- Trade cards show route count plus sender, receiver, resource, amount, payment, route type, and status/flag changes.
- Diplomacy and puppet cards show relation type, parties, active state, tribute/immunity values, and edited fields.
- Military cards show operation count plus operation type, attacker/defender, troop mix, supply required/allocated, status, and edited fields.

Country names should not be repeated in every card. If a section has actions from one country, the section can omit the country name from the card body. If a section mixes multiple countries, use a small country label on each row or group rows by country within that action section.

## Active Effects Summary

The preview keeps important active turn effects, but they move into a top `<details>` element that is collapsed by default. This summary should include named quantities, not vague aggregate totals:

- Gold delta by country.
- Resource net changes by resource.
- Factory inputs and outputs by resource.
- Settlement resource production and upkeep by resource.
- Trade in/out by resource and gold.
- Necessities status and warnings count.

Formula breakdowns remain available inside this collapsed summary or another nested details element for auditability.

## Save-Backed Action Tracking

The preview must not infer current-turn actions from transient UI state. It needs save-backed metadata so JSON/SQLite saves can be reloaded without losing the current turn review.

Add optional turn metadata to action-bearing entities:

- `created_turn?: number`
- `updated_turn?: number`
- `updated_fields?: string[]`

Apply these to settlements, factories, diplomatic relations, puppet relations, trade routes, and military operations. New entities created through the UI should set `created_turn` to `state.turnNumber`. Edits to existing entities should set `updated_turn` to `state.turnNumber` and append changed field names to `updated_fields`, unless the entity was created in the same turn.

Existing saves remain valid. Missing metadata means the entity was not created or edited in the current turn.

## Boundaries

Do not embed named game-state data in code. Tests must use synthetic generic entities only. Do not change `previewNextTurn` commit semantics except to preserve the same warnings/formula output that already exists. Do not replace country-sheet resource tables; this change is only about the dashboard turn preview.

## Testing

Add regression coverage for deriving current-turn action cards from generic save-backed state:

- Expansion rolls summarize count, terrain mix, result mix, and cost.
- New settlements summarize count, tier mix, and output mix.
- New factories summarize type mix, output mix, and input mix.
- Policy, trade, and military changes appear with specific fields.
- Previous-turn entities do not appear in action sections.

Update UI smoke coverage so the dashboard preview no longer renders the old massive formula breakdown as the primary experience and the active effects summary is collapsed by default.
