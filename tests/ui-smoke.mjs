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
const page = await context.newPage();
const errors = [];

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(baseUrl, { waitUntil: "networkidle" });

await test("empty runtime starts without bundled countries", async () => {
  await assertVisibleHeading("Dashboard");
  assert.equal(await page.locator(".country-chip").count(), 0);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await assertVisibleHeading("Dashboard");
  assert.deepEqual(errors, []);
});

await test("primary navigation and dialogs are reachable without runtime errors", async () => {
  for (const name of ["Dashboard", "Dice Roller", "Relations Graph", "Rules Editor"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await assertVisibleHeading(name);
    if (name === "Relations Graph") {
      await assertVisibleButton("Return to center");
      await assertVisibleButton("Reset");
      await page.screenshot({ path: "artifacts/ux-redesign/smoke/relations-graph.png", fullPage: true });
    }
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

await test("created countries provide the full country workflow", async () => {
  await createCountry("Workflow Country", "Workflow", "Workflow Capital\nWorkflow Port");
  await page.getByRole("button", { name: "Workflow", exact: true }).click();
  await assertVisibleHeading("Workflow Country");

  const tabs = ["Overview", "Settlements +", "Production +", "Trade/Diplomacy +", "Military +", "Dice/History", "Notes", "Policies"];
  for (const tab of tabs) {
    const tabButton = page.getByRole("tab", { name: tab, exact: true });
    await tabButton.click();
    assert.equal(await tabButton.evaluate((element) => element.classList.contains("active")), true);
  }

  assert.deepEqual(errors, []);
});

await test("primary navigation avoids horizontal scrolling and long country names remain readable", async () => {
  await createCountry(
    "The Extremely Long Provisional Directorate of Northern Industrial Administration",
    "Long Directorate",
    "Long Capital"
  );

  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 950 });
    await page.waitForTimeout(100);
    const layout = await page.evaluate(() => {
      const sidebar = document.querySelector(".sidebar");
      const navButtons = Array.from(document.querySelectorAll(".sidebar nav button")).map((button) => ({
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
    assert.ok(layout.countryButtons.some((button) => button.title.includes("Northern Industrial Administration")));
  }
});

await test("rules editor uses searchable table sections without horizontal tab scrolling", async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Rules Editor", exact: true }).click();

  const sections = ["Settings", "Settlement rules", "Resource production", "Factory rules", "Policy rules"];

  for (const section of sections) {
    await page.getByRole("button", { name: new RegExp(section) }).click();
    await page.locator(".rule-group").first().waitFor({ state: "visible" });
  }

  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 950 });
    await page.waitForTimeout(100);
    const layout = await page.evaluate(() => {
      const tabs = document.querySelector(".rules-editor .tabs");
      return {
        bodyScrollWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
        tabsOverflowX: tabs ? getComputedStyle(tabs).overflowX : "",
        activeRuleGroups: document.querySelectorAll(".rule-group").length
      };
    });
    assert.ok(layout.bodyScrollWidth <= layout.viewportWidth + 1);
    assert.equal(layout.tabsOverflowX, "visible");
    assert.ok(layout.activeRuleGroups > 0);
  }
});

await test("normal workflows use page scroll instead of nested warning or preview scroll traps", async () => {
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.screenshot({ path: "artifacts/ux-redesign/smoke/transaction-review.png", fullPage: true });

  const layout = await page.evaluate(() => {
    const previewPanel = document.querySelector(".turn-preview-panel");
    const warningList = document.querySelector(".warnings-panel .warning-list");
    const countryTabs = document.querySelector(".country-tabs");
    return {
      previewOverflowY: previewPanel ? getComputedStyle(previewPanel).overflowY : "",
      warningOverflowY: warningList ? getComputedStyle(warningList).overflowY : "",
      countryTabsOverflowX: countryTabs ? getComputedStyle(countryTabs).overflowX : ""
    };
  });

  assert.notEqual(layout.previewOverflowY, "auto");
  assert.notEqual(layout.previewOverflowY, "scroll");
  assert.notEqual(layout.warningOverflowY, "auto");
  assert.notEqual(layout.warningOverflowY, "scroll");
  assert.deepEqual(errors, []);
});

await browser.close();
await server.close();

async function createCountry(name, shortName, settlements) {
  await page.getByRole("button", { name: "Country", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Short sidebar name", { exact: true }).fill(shortName);
  await page.getByPlaceholder("One settlement name per line").fill(settlements);
  await page.getByRole("button", { name: "Create Country", exact: true }).click();
  await page.locator("h2").filter({ hasText: "Create Country" }).waitFor({ state: "detached" });
}

async function assertVisibleHeading(name, selector = "h1") {
  await page.locator(selector).filter({ hasText: name }).first().waitFor({ state: "visible" });
}

async function assertVisibleButton(name) {
  await page.getByRole("button", { name }).waitFor({ state: "visible" });
}
