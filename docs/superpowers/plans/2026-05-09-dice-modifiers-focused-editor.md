# Dice Modifiers Focused Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic recursive Dice Modifiers rules UI with a focused subnav editor that keeps each dice rule group readable and editable.

**Architecture:** Keep `RulesEditor` as the owner of rule updates and add a dice-specific editor path for `state.rules.dice`. The custom editor edits the existing `RulesConfig["dice"]` object directly, while all non-dice rule sections continue using the generic `RuleValueEditor`.

**Tech Stack:** React 18, TypeScript strict mode, existing CSS modules in `src/styles.css`, Playwright UI smoke tests.

---

### Task 1: UI Regression

**Files:**
- Modify: `tests/ui-smoke.mjs`

- [ ] **Step 1: Write the failing test**

Add a smoke test that opens Rules Editor, clicks Dice modifiers, verifies the focused subnav exists, checks that the active panel changes, and checks layout overflow at common widths:

```js
await test("dice modifiers use a focused subnav editor without horizontal overflow", async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Rules Editor", exact: true }).click();
  await page.getByRole("button", { name: "Dice modifiers", exact: true }).click();
  await page.getByRole("button", { name: "Attack terrain", exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Fortifications", exact: true }).click();
  await page.locator("h3").filter({ hasText: "Fortifications" }).waitFor({ state: "visible" });

  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 950 });
    await page.waitForTimeout(100);
    const layout = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      editorCount: document.querySelectorAll(".dice-rules-editor").length,
      subnavOverflow: Array.from(document.querySelectorAll(".dice-rules-subnav button")).some(
        (button) => button.scrollWidth > button.clientWidth + 1
      )
    }));
    assert.ok(layout.bodyScrollWidth <= layout.viewportWidth + 1);
    assert.equal(layout.editorCount, 1);
    assert.equal(layout.subnavOverflow, false);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:ui`

Expected: FAIL because `.dice-rules-editor` and the Dice modifiers subnav do not exist yet.

### Task 2: Dice Editor Component

**Files:**
- Modify: `src/components/RulesEditor.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Implement dice-specific editor branch**

In `RulesEditor`, when `active === "dice"`, render `DiceRulesEditor` instead of `RuleValueEditor`.

- [ ] **Step 2: Add focused subnav editor**

Create `DiceRulesEditor` in `RulesEditor.tsx`. It keeps local active panel state, receives `value: RulesConfig["dice"]`, and emits updated dice rules through `onChange`.

- [ ] **Step 3: Add table helpers**

Add compact helpers for number/text inputs and object tables:

```tsx
function updateRuleRecord<T extends string | number>(
  record: Record<string, T>,
  key: string,
  value: T
): Record<string, T> {
  return { ...record, [key]: value };
}
```

Use number inputs for numeric modifiers and text inputs only for tank terrain values so `impassable` remains editable.

- [ ] **Step 4: Add CSS**

Add CSS classes:

- `.dice-rules-editor`
- `.dice-rules-subnav`
- `.dice-rules-panel`
- `.dice-rules-table`
- `.dice-rules-cost-grid`

The layout is two columns on desktop and one column at existing mobile breakpoints.

### Task 3: Verification

**Files:**
- No new source files.

- [ ] **Step 1: Run targeted UI smoke**

Run: `npm run test:ui`

Expected: all UI smoke tests pass.

- [ ] **Step 2: Run regression suite**

Run: `npm test`

Expected: all regression tests pass.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: TypeScript and Vite production build pass.

- [ ] **Step 4: Browser screenshot check**

Start dev server and use Playwright to open Rules Editor -> Dice modifiers at desktop and tablet widths. Confirm screenshots show a single focused editor with no overlapping controls.
