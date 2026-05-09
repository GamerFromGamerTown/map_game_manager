# Rules Editor Focused Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Option-A focused editor pattern to ruling parties, factory rules, stability rules, and puppet rules, and add structured custom effects to policy categories and tiers.

**Architecture:** Keep `RulesEditor` as the owner of rule section updates. Add section-specific editor branches for `factoryRules`, `rulingParties`, `stabilityRules`, and `puppetTypes`; all write back to the existing `RulesConfig` object. Policy custom effects are stored as optional `custom_effects` maps on policy categories and options.

**Tech Stack:** React 18, TypeScript strict mode, existing CSS in `src/styles.css`, Playwright UI smoke tests.

---

### Task 1: UI Regression

**Files:**
- Modify: `tests/ui-smoke.mjs`

- [ ] Add a smoke test that opens each requested Rules Editor section and verifies the focused editor shell exists.
- [ ] Verify add controls for ruling parties, factories, stability bands, puppet rules, and policy custom effects.
- [ ] Run `npm run test:ui` and confirm the new test fails before implementation.

### Task 2: Types

**Files:**
- Modify: `src/types.ts`

- [ ] Add `CustomRuleEffects = Record<string, string | number>`.
- [ ] Add optional `custom_effects?: CustomRuleEffects` to `PolicyOptionRule` and `PolicyCategoryRule`.

### Task 3: Focused Editors

**Files:**
- Modify: `src/components/RulesEditor.tsx`
- Modify: `src/styles.css`

- [ ] Add focused editor branches for `factoryRules`, `rulingParties`, `stabilityRules`, and `puppetTypes`.
- [ ] Add add controls for new factories, ruling parties, stability bands, and puppet types.
- [ ] Add reusable custom effects editor for policy categories and tier rows.
- [ ] Reuse the existing advanced JSON editor under every section.

### Task 4: Verification

**Files:**
- No new source files.

- [ ] Run `npm run test:ui`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Use Playwright screenshots for the changed rules sections at desktop/tablet widths.
