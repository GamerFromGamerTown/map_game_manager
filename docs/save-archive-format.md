# Structured Save Archive Format

GM Economy Console saves use a deterministic ZIP-style archive. Entries are stored without compression so the files can be inspected with standard ZIP tools and compared after extraction.

## Required Files

- `manifest.json`: archive kind, save format version, app schema version, and migration metadata.
- `countries.json`: country records and policy selections.
- `resources.json`: settlements, factories, and stockpiles.
- `settings.json`: app schema version, turn number, and graph positions.
- `aliases.json`: country IDs, country names, short names, and player/country aliases used by Discord stat-sheet imports.
- `diplomacy.json`: diplomatic relations and puppet relations.
- `trades.json`: directional trade routes.
- `rules.json`: editable game rules, including settlement upkeep route rules.
- `military.json`: military operations and dice roll logs.
- `history.json`: turn logs and override logs.

## Manifest

`manifest.json` has:

```json
{
  "kind": "gm-economy-console-save-archive",
  "save_format_version": 1,
  "app_schema_version": 2,
  "compatibility": {
    "minimum_app_schema_version": 2,
    "legacy_json_schema_version": 2,
    "migration": "legacy monolithic JSON saves are split into domain files when exported as an archive"
  },
  "files": [
    "manifest.json",
    "countries.json",
    "resources.json",
    "settings.json",
    "aliases.json",
    "diplomacy.json",
    "trades.json",
    "rules.json",
    "military.json",
    "history.json"
  ]
}
```

## Alias Handling

`aliases.json` is the authoritative saved source for Discord import aliases. The importer also reads the same alias values from country records after an archive is loaded, so normal `npm run dev` does not need `DISCORD_STAT_SHEET_ALIAS_MAP`.

If a legacy JSON save has no short names or aliases, import still works, but the UI reports a migration warning. The application does not invent aliases during migration.

## Compatibility

Legacy monolithic `.json` saves remain importable. Loading a legacy save normalizes it to the current in-memory schema and reports that it should be re-exported as a structured archive. Exporting through `Export save archive` writes the split archive format.
