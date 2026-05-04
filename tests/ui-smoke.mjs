import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { firefox } from "playwright";

const test = async (name, run) => {
  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
};

await mkdir("artifacts/ux-redesign/smoke", { recursive: true });

const server = await createServer({
  configFile: "vite.config.ts",
  logLevel: "error",
  server: {
    host: "127.0.0.1",
    port: 5197,
    strictPort: false
  }
});

await server.listen();
const baseUrl = server.resolvedUrls?.local?.[0] ?? "http://127.0.0.1:5197/";
const browser = await firefox.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await context.addInitScript(() => localStorage.removeItem("gm-economy-console-state"));
const page = await context.newPage();
const errors = [];

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(baseUrl, { waitUntil: "networkidle" });

await test("primary navigation and dialogs are reachable without runtime errors", async () => {
  for (const name of ["Dashboard", "Dice Roller", "Diplomacy Graph", "Rules Editor"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await assertVisibleHeading(name);
  }

  await page.getByRole("button", { name: "Country", exact: true }).click();
  await assertVisibleHeading("Create Country", "h2");
  await page.getByLabel("Close").click();

  await page.locator("summary").filter({ hasText: "Import / Export" }).click();
  await assertVisibleButton("Export SQLite save");
  await assertVisibleButton("Import JSON backup");
  await page.locator("summary").filter({ hasText: "Import / Export" }).click();

  assert.deepEqual(errors, []);
});

await test("country workflow tabs are task-focused and stay active across countries", async () => {
  await page.getByRole("button", { name: "United Kingdom of Pristanekdrzave" }).click();
  const tabs = ["Overview", "Settlements", "Production", "Policies", "Trade/Diplomacy", "Military", "Dice/History", "Notes"];

  for (const tab of tabs) {
    const tabButton = page.getByRole("tab", { name: tab, exact: true });
    await tabButton.click();
    assert.equal(await tabButton.evaluate((element) => element.classList.contains("active")), true);
  }

  await page.getByRole("button", { name: "Terria Rosia" }).click();
  assert.equal(
    await page.getByRole("tab", { name: "Notes", exact: true }).evaluate((element) => element.classList.contains("active")),
    true
  );
});

await test("primary navigation avoids horizontal scrolling and long country names remain readable", async () => {
  await page.evaluate(() => {
    const key = "gm-economy-console-state";
    const current = JSON.parse(localStorage.getItem(key) ?? "{}");
    current.countries[0].name =
      "The Extremely Long Provisional Directorate of Northern Industrial Administration";
    localStorage.setItem(key, JSON.stringify(current));
  });
  await page.reload({ waitUntil: "networkidle" });

  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 950 });
    await page.waitForTimeout(100);
    const layout = await page.evaluate(() => {
      const sidebar = document.querySelector(".sidebar");
      const navButtons = Array.from(document.querySelectorAll(".sidebar nav button")).map((button) => ({
        text: button.textContent?.trim() ?? "",
        scrollWidth: button.scrollWidth,
        clientWidth: button.clientWidth
      }));
      const countryButtons = Array.from(document.querySelectorAll(".country-chip")).map((button) => ({
        text: button.textContent?.trim() ?? "",
        title: button.getAttribute("title") ?? "",
        height: button.getBoundingClientRect().height,
        scrollWidth: button.scrollWidth,
        clientWidth: button.clientWidth
      }));
      return {
        bodyScrollWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
        sidebarScrollWidth: sidebar?.scrollWidth ?? 0,
        sidebarClientWidth: sidebar?.clientWidth ?? 0,
        navButtons,
        countryButtons
      };
    });

    assert.ok(layout.bodyScrollWidth <= layout.viewportWidth + 1);
    assert.ok(layout.sidebarScrollWidth <= layout.sidebarClientWidth + 1);
    assert.ok(layout.navButtons.every((button) => button.scrollWidth <= button.clientWidth + 1));
    assert.ok(layout.countryButtons.some((button) => button.title.includes("United Kingdom of Pristanekdrzave")));
    if (width === 1440) {
      assert.ok(layout.countryButtons.some((button) => button.text.includes("United Kingdom") && button.height > 36));
    }
  }
});

await test("rules editor uses searchable table sections without horizontal tab scrolling", async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Rules Editor", exact: true }).click();

  const sections = [
    ["Settings", /Setting/],
    ["Settlement tiers", /Tier/],
    ["Resource production", /Biome\/resource/],
    ["Factory rules", /Inputs\/turn/],
    ["Policy rules", /Option count/]
  ];

  for (const [section, expectedHeader] of sections) {
    await page.getByRole("tab", { name: new RegExp(section) }).click();
    await page.locator(".rule-data-table").first().waitFor({ state: "visible" });
    assert.ok(await page.getByRole("columnheader", { name: expectedHeader }).first().isVisible());
  }

  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 950 });
    await page.waitForTimeout(100);
    const layout = await page.evaluate(() => {
      const tabs = document.querySelector(".rules-section-tabs");
      return {
        bodyScrollWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
        tabsOverflowX: tabs ? getComputedStyle(tabs).overflowX : "",
        cardRows: document.querySelectorAll(".rule-array-row").length,
        activeTables: document.querySelectorAll(".rule-data-table").length
      };
    });
    assert.ok(layout.bodyScrollWidth <= layout.viewportWidth + 1);
    assert.equal(layout.tabsOverflowX, "visible");
    assert.equal(layout.cardRows, 0);
    assert.ok(layout.activeTables > 0);
  }
});

await test("warning routing opens the exact country workflow and editable field", async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  const warning = page
    .locator(".warning-action")
    .filter({ hasText: "Federation of Gaymers" })
    .filter({ hasText: "Fix necessities stockpile" })
    .first();
  await warning.click();

  await assertVisibleHeading("Federation of Gaymers");
  const productionTab = page.getByRole("tab", { name: "Production", exact: true });
  assert.equal(await productionTab.evaluate((element) => element.classList.contains("active")), true);
  await page.locator("#resource-gaymer-necessities").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.activeElement?.id === "resource-gaymer-necessities");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "resource-gaymer-necessities");
});

await test("editing a routed warning target updates preview diff and commit requires override for remaining blockers", async () => {
  await page.locator("#resource-gaymer-necessities").fill("1");
  await page.locator("body").click();
  await page.getByRole("button", { name: "Preview Turn", exact: true }).click();
  await assertVisibleHeading("Turn Transaction Review", "h2");
  await page.locator(".transaction-review").waitFor({ state: "visible" });
  await page.screenshot({ path: "artifacts/ux-redesign/smoke/transaction-review.png", fullPage: true });

  const blockerCount = await page.locator(".danger-metric strong").first().textContent();
  assert.equal(blockerCount?.trim(), "10");
  await expectNoVisibleText("Federation of Gaymers resource");

  const confirm = page.getByRole("button", { name: "Confirm Commit" });
  assert.equal(await confirm.isDisabled(), true);
  await page.getByPlaceholder("Explain why this turn can be committed with unresolved blockers").fill("GM accepts remaining shortages for smoke verification.");
  assert.equal(await confirm.isEnabled(), true);
});

await test("normal workflows use page scroll instead of nested warning or preview scroll traps", async () => {
  await page.locator(".modal-footer").getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.waitForTimeout(100);
  const layout = await page.evaluate(() => {
    const previewPanel = document.querySelector(".turn-preview-panel");
    const warningList = document.querySelector(".warnings-panel .warning-list");
    const countryTabs = document.querySelector(".country-tabs");
    const tableWraps = Array.from(document.querySelectorAll(".table-wrap")).map((wrap) => ({
      overflowY: getComputedStyle(wrap).overflowY
    }));
    return {
      previewOverflowY: previewPanel ? getComputedStyle(previewPanel).overflowY : "",
      warningOverflowY: warningList ? getComputedStyle(warningList).overflowY : "",
      countryTabsOverflowX: countryTabs ? getComputedStyle(countryTabs).overflowX : "",
      tableWraps
    };
  });

  assert.notEqual(layout.previewOverflowY, "auto");
  assert.notEqual(layout.previewOverflowY, "scroll");
  assert.notEqual(layout.warningOverflowY, "auto");
  assert.notEqual(layout.warningOverflowY, "scroll");
  assert.ok(layout.tableWraps.every((wrap) => wrap.overflowY === "visible"));
  assert.deepEqual(errors, []);
});

await browser.close();
await server.close();

async function assertVisibleHeading(name, selector = "h1") {
  await page.locator(selector).filter({ hasText: name }).first().waitFor({ state: "visible" });
}

async function assertVisibleButton(name) {
  await page.getByRole("button", { name }).waitFor({ state: "visible" });
}

async function expectNoVisibleText(text) {
  const count = await page.getByText(text).count();
  for (let index = 0; index < count; index++) {
    assert.equal(await page.getByText(text).nth(index).isVisible(), false);
  }
}
