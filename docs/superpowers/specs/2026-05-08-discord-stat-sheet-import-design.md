# Discord Stat Sheet Import Design

## Goal

Add a read-only Discord fetch script and a separate browser import path for compact stat-sheet JSON bundles. The workflow must preserve the app's save rules: fetched country/stat data is never embedded in code and full game rules remain sourced from the current JSON save.

## Architecture

The implementation has three boundaries:

- `scripts/fetch-discord-stat-sheets.mjs` reads only an explicit allowlist of Discord thread URLs and writes a compact JSON import artifact.
- `src/import/statSheetParser.ts` parses loose Markdown/stat-sheet text into typed import records with warnings and blocking errors.
- `src/import/statSheetImport.ts` merges a parsed bundle into an existing `GameState`, preserving `rules`, logs, turn number, and other non-sheet state.

The app adds an `Import stat sheets` button beside the existing JSON import. It accepts only the compact import format, runs the merge, validates the resulting `GameState`, and shows an actionable report.

## Data Format

The compact artifact uses a dedicated wrapper:

```json
{
  "kind": "gm-stat-sheet-import",
  "version": 1,
  "source": {
    "generatedAt": "2026-05-08T00:00:00.000Z",
    "threads": []
  },
  "sheets": [],
  "report": {
    "warnings": [],
    "errors": []
  }
}
```

Each sheet can contain country core stats, settlements, constructions, resources, policies, diplomacy text, trades, and raw source text. Missing optional sections produce warnings, not failures. Blocking errors are reserved for cases the app cannot safely merge, such as a sheet without a country name or duplicate ambiguous country matches.

## Parser Behavior

The parser is permissive:

- Accept Markdown headings, bold labels, plain labels, and inconsistent whitespace.
- Accept missing parentheses or brackets around formulas.
- Accept `1,000`, `1.000`, `+1 000`, and bare numbers.
- Preserve unparsed text in report messages instead of guessing.
- Normalize known resources to existing `ResourceType` keys.

Every warning or error includes a message, severity, optional country/thread, optional line number, and a suggested fix. This gives the GM a direct edit target when syntax is irreconcilable.

## Discord Safety

The fetcher reads a Discord *user token* from `DISCORD_BOT_TOKEN` in the environment and sends it as the raw `Authorization` header value (no `Bot ` prefix). It rejects any URL outside the configured guild/channel/thread allowlist, uses only Discord GET endpoints, honors `retry_after`, and spaces requests conservatively. It does not send messages, add reactions, edit messages, enumerate unrelated channels, or write the token to files or logs.

## UI

The import menu adds `Import stat sheets`. After import, the existing state history records the previous state for undo. The menu shows a concise status:

- Imported count when no blocking errors are present.
- Warning count with suggested fixes when fields were skipped.
- Blocking error count and first actionable fix when import cannot apply.

## Tests

Regression coverage will verify:

- The parser accepts loose stat-sheet syntax.
- Parse reports include actionable errors for irreconcilable input.
- Import preserves existing `rules` and `turnNumber`.
- Import validation rejects malformed compact bundles.
- UI exposes `Import stat sheets`.
