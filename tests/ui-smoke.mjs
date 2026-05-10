import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
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
const defaultState = JSON.parse(await readFile("src/data/default-state.json", "utf8"));

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
  window.__savePickerFile = {
    kind: "file",
    name: "remembered-save.json",
    getFile: async () => new File(["{}"], "remembered-save.json", { type: "application/json" }),
    queryPermission: async () => "granted",
    requestPermission: async () => "granted"
  };
  window.showOpenFilePicker = async () => {
    window.__jsonPickerCalls += 1;
    return [window.__savePickerFile];
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

  await openImportExportMenu();
  assert.equal(await page.getByRole("button", { name: "Export SQLite save", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Import SQLite save", exact: true }).count(), 0);
  await assertVisibleButton("Export save archive");
  await assertVisibleButton("Export legacy JSON backup");
  await assertVisibleButton("Import save archive / JSON backup");
  await assertVisibleButton("Import from Discord stat sheets");
  assert.equal(await page.getByRole("button", { name: "Import stat sheets from JSON file", exact: true }).count(), 0);
  await closeImportExportMenu();

  assert.deepEqual(errors, []);
});

await test("UI imports and exports structured save archives with aliases", async () => {
  const archiveState = makeArchiveState();
  const legacyBytes = new TextEncoder().encode(JSON.stringify(archiveState));
  await setPickerPayload("ui-save.json", "application/json", legacyBytes);

  await openImportExportMenu();
  await page.getByRole("button", { name: "Import save archive / JSON backup", exact: true }).click();
  await page.getByText(/Imported Legacy JSON backup/i).waitFor({ state: "visible" });
  await page.locator('.country-chip[title="Current UI Country"]').waitFor({ state: "visible" });
  await page.locator('.country-chip[title="Counterpart UI Country"]').waitFor({ state: "visible" });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export save archive", exact: true }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.gm-save\.zip$/);
  const downloadedPath = await download.path();
  assert.ok(downloadedPath);
  const exportedBytes = await readFile(downloadedPath);

  await createCountry("Temporary UI Country", "Temp", "Temporary Capital");
  assert.equal(await page.locator(".country-chip").count(), 3);
  if ((await page.getByRole("button", { name: "Import save archive / JSON backup", exact: true }).count()) === 0) {
    await page.locator("summary").filter({ hasText: "Import / Export" }).click();
  }
  await setPickerPayload("exported-ui-save.gm-save.zip", "application/zip", exportedBytes);
  await page.getByRole("button", { name: "Import save archive / JSON backup", exact: true }).click();
  await page.getByText(/Imported Structured save archive/i).waitFor({ state: "visible" });
  assert.equal(await page.locator(".country-chip").count(), 2);
  assert.equal(await page.locator('.country-chip[title="Temporary UI Country"]').count(), 0);
  await closeImportExportMenu();
});

await test("front-facing Discord import uses aliases from the loaded save archive", async () => {
  await page.route("**/api/import/discord-stat-sheets", async (route) => {
    const aliasFreeBundle = {
      kind: "gm-stat-sheet-import",
      version: 1,
      source: { generatedAt: new Date(0).toISOString(), threads: [] },
      sheets: [
        {
          country: { name: "Current UI Country", gold: 1000, stability: 50 },
          settlements: [],
          factories: [],
          stockpiles: {},
          policies: [],
          diplomacy: [{ relation_type: "Guarantee", counterpart_name: "Saved UI Alias", lineNumber: 4, sourceLine: "**Guarantee:** Saved UI Alias" }],
          trades: [
            {
              direction: "import",
              counterpart_name: "Saved UI Alias",
              resource_type: "iron_parts",
              amount_per_turn: 2,
              notes: "2 iron parts (Saved UI Alias)",
              lineNumber: 2,
              sourceLine: "**Trades to (imports) and amount:** 2 iron parts (Saved UI Alias)"
            }
          ],
          rawText: "",
          threadId: "alias-ui-thread"
        },
        {
          country: { name: "Counterpart UI Country", gold: 1000, stability: 50 },
          settlements: [],
          factories: [],
          stockpiles: { iron_parts: 3 },
          policies: [],
          diplomacy: [],
          trades: [],
          rawText: "",
          threadId: "alias-counterpart-ui-thread"
        }
      ],
      report: { warnings: [], errors: [] }
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(aliasFreeBundle)
    });
  });

  await openImportExportMenu();
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Import from Discord stat sheets", exact: true }).click();
  await page.getByText(/Imported Discord stat sheets for 2 countries/i).waitFor({ state: "visible" });
  assert.equal(await page.getByText(/unknown country Saved UI Alias/i).count(), 0);

  await page.locator('.country-chip[title="Current UI Country"]').click();
  await page.getByRole("tab", { name: "Trade/Diplomacy +", exact: true }).click();
  await page.getByText(/Counterpart UI Country sends 2 Iron Parts to Current UI Country/i).waitFor({ state: "visible" });
  await page.locator("section").filter({ hasText: "Diplomacy" }).getByRole("combobox").first().waitFor({ state: "visible" });
  await page.unroute("**/api/import/discord-stat-sheets");
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

    const simpleBundle = {
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
          diplomacy: [],
          trades: [],
          rawText: "",
          threadId: "ui-thread"
        }
      ],
      report: { warnings: [], errors: [] }
    };
    const routeBundle = {
      kind: "gm-stat-sheet-import",
      version: 1,
      source: { generatedAt: new Date(0).toISOString(), threads: [] },
      sheets: [
        {
          country: { name: "The New Eruyios Empire", gold: 0, stability: 50 },
          settlements: [
            {
              name: "Veinlands",
              tier: "village",
              is_capital: false,
              biome_or_resource_type: "stat_food"
            },
            {
              name: "Erympus",
              tier: "city",
              is_capital: true,
              biome_or_resource_type: "stat_gold",
              upkeep_option: "B",
              notes: "+2 gold, -5 food, -2 iron parts (Capital)"
            },
            {
              name: "Large Route City",
              tier: "large_city",
              is_capital: false,
              biome_or_resource_type: "stat_wood",
              upkeep_option: "B"
            },
            {
              name: "Metro Route City",
              tier: "metropole",
              is_capital: false,
              biome_or_resource_type: "stat_coal",
              upkeep_option: "B"
            }
          ],
          factories: [],
          stockpiles: { food: 35, plank: 9, iron_parts: 14, aluminium_parts: 0 },
          policies: [],
          diplomacy: [],
          trades: [],
          rawText: "",
          threadId: "ui-route-thread"
        }
      ],
      report: { warnings: [], errors: [] }
    };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(discordImportCalls === 3 ? routeBundle : simpleBundle)
    });
  });

  await openImportExportMenu();
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

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await openImportExportMenu();
  await page.getByRole("button", { name: "Import from Discord stat sheets", exact: true }).click();
  await page.getByRole("button", { name: "The New Eruyios Empire", exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "The New Eruyios Empire", exact: true }).click();
  await page.getByRole("tab", { name: "Settlements +", exact: true }).click();

  assert.equal(await page.locator(".upkeep-route-toggle").count(), 3);
  const settlementCards = page.locator(".settlement-card");
  const villageCard = settlementCards.nth(0);
  assert.equal(await villageCard.locator(".upkeep-route-toggle").count(), 0);

  const erympusCard = settlementCards.nth(1);
  assert.equal(
    await erympusCard.getByRole("button", { name: "Iron parts", exact: true }).getAttribute("aria-pressed"),
    "true"
  );
  assert.equal(
    await erympusCard.getByRole("button", { name: "Aluminium parts", exact: true }).getAttribute("aria-pressed"),
    "false"
  );
  assert.equal(
    await settlementCards.nth(2).locator(".upkeep-route-toggle").count(),
    1
  );
  assert.equal(
    await settlementCards.nth(3).locator(".upkeep-route-toggle").count(),
    1
  );

  await erympusCard.getByRole("button", { name: "Aluminium parts", exact: true }).click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByText(/Erympus.*Aluminium Parts 0\/1/).waitFor({ state: "visible" });
  assert.equal(discordImportCalls, 3);
  await closeImportExportMenu();
});

await test("save import uses the rememberable file picker when available", async () => {
  await openImportExportMenu();
  const before = await page.evaluate(() => window.__jsonPickerCalls);
  await page.getByRole("button", { name: "Import save archive / JSON backup", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__jsonPickerCalls), before + 1);
  await closeImportExportMenu();
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
  await fallbackPage.getByRole("button", { name: "Import save archive / JSON backup", exact: true }).click();
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

async function importExportMenuIsOpen() {
  return (await page.getByRole("button", { name: "Import from Discord stat sheets", exact: true }).count()) > 0;
}

async function openImportExportMenu() {
  if (!(await importExportMenuIsOpen())) {
    await page.locator("summary").filter({ hasText: "Import / Export" }).click();
  }
}

async function closeImportExportMenu() {
  if (await importExportMenuIsOpen()) {
    await page.locator("summary").filter({ hasText: "Import / Export" }).click();
  }
}

async function setPickerPayload(name, mimeType, bytes) {
  await page.evaluate(
    ({ fileName, type, data }) => {
      window.__savePickerFile = {
        kind: "file",
        name: fileName,
        getFile: async () => new File([new Uint8Array(data)], fileName, { type }),
        queryPermission: async () => "granted",
        requestPermission: async () => "granted"
      };
    },
    { fileName: name, type: mimeType, data: Array.from(bytes) }
  );
}

function makeCountry(id, name, shortName, aliases = []) {
  return {
    id,
    name,
    short_name: shortName,
    aliases,
    color: "#4f8cff",
    is_player_country: true,
    ruling_party: "Democratic",
    gold: 1000,
    stability: 50,
    manpower: 0,
    manpower_cap: 40000,
    manual_manpower_cap_override: null,
    reserve: 0,
    equipment: 0,
    high_quality_equipment: 0,
    tanks: 0,
    supply: 0,
    current_turn_created: 0,
    at_war: false,
    peace_turns_count: 0,
    notes: ""
  };
}

function makeArchiveState() {
  const countries = [
    makeCountry("current-ui-country", "Current UI Country", "Current"),
    makeCountry("counterpart-ui-country", "Counterpart UI Country", "Counterpart", ["Saved UI Alias"])
  ];
  return {
    ...structuredClone(defaultState),
    countries,
    policies: countries.flatMap((country) =>
      defaultState.rules.policyCategories.map((category) => ({
        country_id: country.id,
        policy_category: category.category,
        selected_option: category.base_option,
        last_changed_turn: 0
      }))
    ),
    stockpiles: countries.flatMap((country) =>
      defaultState.rules.resources.map((resource_type) => ({
        country_id: country.id,
        resource_type,
        amount: resource_type === "iron_parts" && country.id === "counterpart-ui-country" ? 3 : 0
      }))
    )
  };
}

async function assertVisibleHeading(name, selector = "h1") {
  await page.locator(selector).filter({ hasText: name }).first().waitFor({ state: "visible" });
}

async function assertVisibleButton(name) {
  await page.getByRole("button", { name }).waitFor({ state: "visible" });
}
