# Discord Stat Sheet Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe read-only Discord stat-sheet fetch workflow and a browser import path for compact stat-sheet JSON bundles.

**Architecture:** Keep network access in a Node script and keep browser import local. Parse Discord/stat-sheet text into a compact artifact, then merge that artifact into the current `GameState` while preserving rules and audit state.

**Tech Stack:** React, TypeScript, existing Node test runner, Playwright UI smoke tests, Discord REST API via Node `fetch`.

---

### Task 1: Stat Sheet Import Types And Parser

**Files:**
- Create: `src/import/statSheetTypes.ts`
- Create: `src/import/statSheetParser.ts`
- Modify: `tests/regression.test.ts`

- [ ] Write failing tests for permissive parsing and actionable blocking errors.
- [ ] Run `npm test` and confirm the parser imports are missing.
- [ ] Implement import types and parser helpers.
- [ ] Run `npm test` and confirm parser tests pass.

### Task 2: GameState Merge

**Files:**
- Create: `src/import/statSheetImport.ts`
- Modify: `tests/regression.test.ts`

- [ ] Write failing tests proving stat-sheet import preserves `rules`, `turnNumber`, logs, and produces import report errors for malformed bundles.
- [ ] Run `npm test` and confirm failures are specific to missing merge logic.
- [ ] Implement compact bundle validation and `applyStatSheetImport`.
- [ ] Run `npm test` and confirm import tests pass.

### Task 3: Browser Import UI

**Files:**
- Modify: `src/components/ExportImportControls.tsx`
- Modify: `tests/ui-smoke.mjs`

- [ ] Write a failing UI smoke assertion for the `Import stat sheets` button.
- [ ] Run `npm run test:ui` and confirm the assertion fails.
- [ ] Add a hidden file input and button for compact stat-sheet imports.
- [ ] Display success, warning, or blocking-error status with suggested fixes.
- [ ] Run `npm run test:ui` and confirm the UI assertion passes.

### Task 4: Discord Fetch Script

**Files:**
- Create: `scripts/fetch-discord-stat-sheets.mjs`

- [ ] Implement allowlisted thread URL parsing.
- [ ] Read `DISCORD_BOT_TOKEN` from the environment and fail without printing it.
- [ ] Fetch messages through Discord GET endpoints only.
- [ ] Honor Discord rate-limit responses and use a fixed inter-request delay.
- [ ] Write compact JSON artifact to an explicit output path.
- [ ] Do not run the live fetch until network access and environment token are available.

### Task 5: Verification

**Files:**
- No new files.

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] If browser UI changed, run `npm run test:ui`.
- [ ] Report any network fetch not run because token/network access was unavailable.

