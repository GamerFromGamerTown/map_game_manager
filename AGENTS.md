# AGENTS.md

## Project Overview

This project is a local-first React + TypeScript GM economy console for a custom turn-based map-game. It is not a geographic map renderer. It is a spreadsheet-style state-management, rules-calculation, audit, and GM automation tool.

Read [docs/original-product-prompt.md](docs/original-product-prompt.md) before making broad feature or rules changes. That document preserves the original product prompt and acceptance criteria.

## Setup Commands

- Install dependencies: `npm install`
- Start local dev server: `npm run dev`
- Run regression tests: `npm test`
- Build and typecheck: `npm run build`

There is currently no lint script. Do not claim lint has passed unless one is added and run.

## Git Workflow

- This repo should stay usable from `main`.
- Make small, focused commits with clear messages, for example `Add import validation tests`.
- Before committing code changes, run `npm test` and `npm run build`.
- Do not commit generated output or local saves: `node_modules/`, `dist/`, `.tmp/`, `*.sqlite`, and `*.db` are ignored.
- Avoid destructive git commands such as `git reset --hard` unless the user explicitly asks for them.
- If the worktree has unrelated changes, leave them alone and mention them in the handoff.
- Prefer one topic per commit: docs, tests, rules-engine fixes, and UI polish should not be bundled unless the change requires it.

## Code Style

- Use TypeScript strict mode and keep types explicit at module boundaries.
- Prefer small focused modules. If a file is growing much beyond roughly 400 lines, extract cohesive helpers or components when touching that area.
- Keep React components presentational where practical; move calculations and business rules into `src/engine`, `src/rules`, `src/data`, or typed helpers.
- Do not hardcode country names, settlement names, diplomacy pairs, seed stockpiles, or named game entities in application logic. Country-specific data belongs in seed data, fixtures, saves, or imports.
- Do not scatter rule constants through UI components. Add editable values to `RulesConfig` and `src/rules/defaultRules.ts`, then consume them through the rules object.
- Keep JSON editing as an advanced option only. Prefer structured controls for GM-facing rules and state editing.
- Use React text rendering for user-authored content. Do not use `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, or dynamic code execution.
- Use ASCII in new files unless existing content or game data requires non-ASCII names.
- Add concise comments only where they clarify non-obvious calculation ordering or schema behavior.

## Calculation Rules

- `previewNextTurn` is the source calculation path for turn processing.
- `commitTurn` must persist the same calculated values that preview would show for the current state.
- Turn logs must preserve formula breakdowns, warnings, resources before/after, and GM notes.
- Manual overrides must create `OverrideLog` entries with field, old value, new value, reason, turn number, and timestamp.
- Warnings should not disappear between preview, commit, and turn history.
- SQLite and JSON imports must validate schema/version and reject malformed or incompatible game states before applying them.

## Testing Instructions

- Add or update regression coverage for calculation, validation, persistence, or audit-log bugs.
- Use `npm test` for the lightweight regression suite.
- Use `npm run build` for TypeScript and production bundle verification.
- If a behavior is important and currently uncovered, write a failing regression test before patching when practical.

## UI Guidelines

- This is a GM operations tool for a college student, not a developer demo.
- Prefer dense but readable tables, tabs, forms, warning panels, and formula breakdowns.
- Avoid raw JSON on default screens.
- Avoid decorative UI and excessive animation.
- Dark mode should remain the default unless the user asks otherwise.
- Make user-editable text safe by rendering it as text, not HTML.

## Security And Local-First Constraints

- No login system.
- No online backend.
- No telemetry or remote persistence.
- File imports are untrusted input.
- SQLite saves are local export/import artifacts, not a trusted execution format.
