# Policy Rules Focused Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic nested Policy Rules editor with a category-detail editor that supports adding policy categories, adding ordered tiers, and reordering tiers.

**Architecture:** Keep `RulesEditor` as the rule update owner. Add a policy-specific editor branch for `state.rules.policyCategories`, leaving the advanced JSON editor available and all other rule sections unchanged.

**Tech Stack:** React 18, TypeScript strict mode, existing CSS in `src/styles.css`, Playwright UI smoke tests.

---

### Task 1: UI Regression

**Files:**
- Modify: `tests/ui-smoke.mjs`

- [ ] Add a failing UI smoke test that opens Rules Editor -> Policy rules, verifies a category subnav, clicks `+ Policy`, clicks `+ Tier`, and uses a tier reorder control.
- [ ] Run `npm run test:ui` and confirm it fails because `.policy-rules-editor`, `+ Policy`, `+ Tier`, and move controls do not exist yet.

### Task 2: Focused Policy Editor

**Files:**
- Modify: `src/components/RulesEditor.tsx`
- Modify: `src/styles.css`

- [ ] In `RulesEditor`, render `PolicyRulesEditor` when `active === "policyCategories"`.
- [ ] Add a left category subnav with policy names and a `+ Policy` action.
- [ ] Add a focused category metadata panel with fields for name, abbreviation, step cost, base tier, forced-by-master, and forced-cost-halved.
- [ ] Add an ordered tier table with fields for name, gold/manpower/stability per turn, special text, move up/down controls, base tier control, delete tier, and `+ Tier`.
- [ ] Keep Military Service custom step fields visible only when present on the category.

### Task 3: Verification

**Files:**
- No new source files.

- [ ] Run `npm run test:ui`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Use Playwright to screenshot Policy Rules at desktop and tablet widths and confirm no overlapping controls or horizontal overflow.
