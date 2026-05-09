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
await context.addInitScript(() => {
  window.__jsonPickerCalls = 0;
  window.showOpenFilePicker = async () => {
    window.__jsonPickerCalls += 1;
    return [
      {
        kind: "file",
        name: "remembered-save.json",
        getFile: async () => new File(["{}"], "remembered-save.json", { type: "application/json" }),
        queryPermission: async () => "granted",
        requestPermission: async () => "granted"
      }
    ];
  };
});
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
  assert.equal(await page.getByRole("button", { name: "Export SQLite save", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Import SQLite save", exact: true }).count(), 0);
  await assertVisibleButton("Export JSON backup");
  await assertVisibleButton("Import JSON backup");
  await assertVisibleButton("Import from Discord stat sheets");
  assert.equal(await page.getByRole("button", { name: "Import stat sheets from JSON file", exact: true }).count(), 0);
  await page.locator("summary").filter({ hasText: "Import / Export" }).click();

  assert.deepEqual(errors, []);
});

await test("Discord stat-sheet import calls the local endpoint instead of opening a file picker", async () => {
  let discordImportCalls = 0;
  await page.route("**/api/import/discord-stat-sheets", async (route) => {
    discordImportCalls += 1;
    assert.equal(route.request().method(), "POST");

    if (discordImportCalls === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Local Discord import endpoint is unavailable. Start the app with npm run dev." })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "gm-stat-sheet-import",
        version: 1,
        source: { generatedAt: new Date(0).toISOString(), threads: [] },
        sheets: [
          {
            country: { name: "UI Imported Country", gold: 123, stability: 44 },
            settlements: [
              {
                name: "UI Imported Capital",
                tier: "village",
                is_capital: true,
                biome_or_resource_type: "food"
              }
            ],
            factories: [],
            stockpiles: {},
            policies: [],
            rawText: "",
            threadId: "ui-thread"
          }
        ],
        report: { warnings: [], errors: [] }
      })
    });
  });

  await page.locator("summary").filter({ hasText: "Import / Export" }).click();
  page.once("dialog", async (dialog) => {
    assert.match(dialog.message(), /reset your current state/i);
    assert.match(dialog.message(), /not undo-able/i);
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Import from Discord stat sheets", exact: true }).click();
  assert.equal(discordImportCalls, 0);

  const noChooserOnError = page.waitForEvent("filechooser", { timeout: 250 }).then(() => false, () => true);
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Import from Discord stat sheets", exact: true }).click();
  assert.equal(await noChooserOnError, true);
  await page.getByText("Local Discord import endpoint is unavailable").waitFor({ state: "visible" });

  const noChooserOnSuccess = page.waitForEvent("filechooser", { timeout: 250 }).then(() => false, () => true);
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Import from Discord stat sheets", exact: true }).click();
  assert.equal(await noChooserOnSuccess, true);
  await page.getByRole("button", { name: "UI Imported Country", exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByText("No recorded current-turn actions.").waitFor({ state: "visible" });
  assert.equal(discordImportCalls, 2);
  await page.locator("summary").filter({ hasText: "Import / Export" }).click();
});

await test("JSON import uses the rememberable file picker when available", async () => {
  await page.locator("summary").filter({ hasText: "Import / Export" }).click();
  await page.getByRole("button", { name: "Import JSON backup", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__jsonPickerCalls), 1);
  await page.locator("summary").filter({ hasText: "Import / Export" }).click();
});

await test("created countries provide the full country workflow", async () => {
  await createCountry("Workflow Country", "Workflow", "Workflow Capital\nWorkflow Port");
  await page.getByRole("button", { name: "Workflow", exact: true }).click();
  await assertVisibleHeading("Workflow Country");

  const tabs = ["Overview", "Settlements +", "Production", "Factories +", "Trade/Diplomacy +", "Military +", "Dice/History", "Policies"];
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

await test("policy rules use an ordered tier editor with add and reorder controls", async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Rules Editor", exact: true }).click();
  await page.getByRole("button", { name: "Policy rules", exact: true }).click();
  await page.getByRole("button", { name: "Population Growth", exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Add policy", exact: true }).click();
  await page.locator('input[value="New Policy"]').waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Add tier", exact: true }).click();
  await page.locator('input[value="New Tier 2"]').waitFor({ state: "visible" });
  await page.getByLabel("Move New Tier 2 up").click();

  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 950 });
    await page.waitForTimeout(100);
    const layout = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      editorCount: document.querySelectorAll(".policy-rules-editor").length,
      subnavOverflow: Array.from(document.querySelectorAll(".policy-rules-subnav button")).some(
        (button) => button.scrollWidth > button.clientWidth + 1
      )
    }));
    assert.ok(layout.bodyScrollWidth <= layout.viewportWidth + 1);
    assert.equal(layout.editorCount, 1);
    assert.equal(layout.subnavOverflow, false);
  }
});

await test("rule sections use focused side editors and custom effect controls", async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Rules Editor", exact: true }).click();

  await page.getByRole("button", { name: "Policy rules", exact: true }).click();
  await page.getByRole("button", { name: "Add policy custom effect", exact: true }).click();
  await page.locator('input[value="custom_effect"]').waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Add tier custom effect", exact: true }).first().click();
  await page.locator('input[value="tier_effect"]').waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Factory rules", exact: true }).click();
  await page.locator(".factory-rules-editor").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Add factory rule", exact: true }).click();
  await page.locator('input[value="New Factory"]').waitFor({ state: "visible" });
  await page.getByLabel("Aliases for New Factory").fill("Alternate Factory\nTypo Factory");

  await page.getByRole("button", { name: "Ruling parties", exact: true }).click();
  await page.locator(".ruling-party-rules-editor").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Add ruling party", exact: true }).click();
  await page.locator('input[value="New Party"]').waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Stability rules", exact: true }).click();
  await page.locator(".stability-rules-editor").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Stability bands", exact: true }).click();
  await page.getByRole("button", { name: "Add stability band", exact: true }).click();
  await page.locator('input[value="custom revolt risk"]').waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Puppet rules", exact: true }).click();
  await page.locator(".puppet-rules-editor").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Add puppet type", exact: true }).click();
  await page.locator('input[value="New Puppet Type"]').waitFor({ state: "visible" });

  const layout = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth
  }));
  assert.ok(layout.bodyScrollWidth <= layout.viewportWidth + 1);
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

await test("browsers without reusable file handles persist imported JSON across reload", async () => {
  const fallbackContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await fallbackContext.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", {
      configurable: true,
      value: undefined
    });
  });

  const fallbackPage = await fallbackContext.newPage();
  await fallbackPage.goto(baseUrl, { waitUntil: "networkidle" });
  await fallbackPage.locator("summary").filter({ hasText: "Import / Export" }).click();
  const chooserPromise = fallbackPage.waitForEvent("filechooser");
  await fallbackPage.getByRole("button", { name: "Import JSON backup", exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles("src/data/starter_game.json");
  await fallbackPage.getByText("9 records").waitFor({ state: "visible" });
  await fallbackPage.reload({ waitUntil: "networkidle" });
  await fallbackPage.getByText("9 records").waitFor({ state: "visible" });
  assert.equal(await fallbackPage.locator(".country-chip").count(), 9);
  assert.equal(await fallbackPage.getByRole("button", { name: "Reload remembered save", exact: true }).count(), 0);
  await fallbackContext.close();
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
