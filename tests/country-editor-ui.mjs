import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { firefox } from "playwright";

await mkdir("artifacts/country-editor", { recursive: true });

const server = await createServer({
  configFile: "vite.config.ts",
  logLevel: "error",
  server: {
    host: "127.0.0.1",
    port: 5242,
    strictPort: false
  }
});

await server.listen();
const baseUrl = server.resolvedUrls?.local?.[0] ?? "http://127.0.0.1:5242/";
const browser = await firefox.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await createCountry("Editor Country", "Editor", "Editor Capital\nEditor Forest");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.locator("h1").filter({ hasText: "Editor Country" }).first().waitFor({ state: "visible" });

  const tabLabels = await page.getByRole("tab").evaluateAll((tabs) =>
    tabs.map((tab) => tab.textContent?.trim().replace(/\s+/g, " ") ?? "")
  );
  assert.deepEqual(tabLabels, [
    "Overview",
    "Settlements +",
    "Production",
    "Factories +",
    "Trade/Diplomacy +",
    "Military +",
    "Dice/History",
    "Policies"
  ]);

  const coreInputWidths = await page.locator(".core-number-grid input").evaluateAll((inputs) =>
    inputs.map((input) => Math.round(input.getBoundingClientRect().width))
  );
  assert.ok(coreInputWidths.length >= 6);
  assert.ok(coreInputWidths.every((width) => width <= 280), `core input widths: ${coreInputWidths.join(", ")}`);
  await page.screenshot({ path: "artifacts/country-editor/overview-desktop.png", fullPage: true });

  await page.getByRole("tab", { name: "Settlements +", exact: true }).click();
  await page.locator(".settlement-card").first().waitFor({ state: "visible" });
  assert.equal(await page.locator(".settlement-card").count(), 2);
  assert.equal(await page.locator(".settlement-card select option[value='calculated']").count(), 0);
  assert.equal(await page.locator(".derived-output").first().isVisible(), true);
  assert.equal(await page.locator(".settlement-notes details").first().isVisible(), true);
  await page.locator(".settlement-card").first().locator("select").first().selectOption("city");
  assert.equal(await page.locator(".upkeep-route-toggle").first().isVisible(), true);
  assert.equal(
    await page.locator(".upkeep-route-toggle").first().getByRole("button", { name: "Aluminium", exact: true }).getAttribute("aria-pressed"),
    "true"
  );

  const settlementGridColumns = await page.locator(".settlement-card-grid").evaluate((grid) =>
    getComputedStyle(grid).gridTemplateColumns.split(" ").length
  );
  assert.equal(settlementGridColumns, 2);
  const desktopLayout = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth
  }));
  assert.ok(desktopLayout.bodyScrollWidth <= desktopLayout.viewportWidth + 1);

  await page.screenshot({ path: "artifacts/country-editor/settlements-desktop.png", fullPage: true });

  await page.getByRole("tab", { name: "Production", exact: true }).click();
  await page.locator(".resource-table").first().waitFor({ state: "visible" });
  assert.equal(await page.getByRole("button", { name: "Add factory", exact: true }).count(), 0);

  await page.getByRole("tab", { name: "Factories +", exact: true }).click();
  await page.getByRole("button", { name: "Add factory", exact: true }).click();
  await page.locator(".modal-footer").getByRole("button", { name: "Create", exact: true }).click();
  await page.locator(".factory-card").first().waitFor({ state: "visible" });
  assert.equal(await page.locator(".factory-card").count(), 1);
  const productionLayout = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth
  }));
  assert.ok(productionLayout.bodyScrollWidth <= productionLayout.viewportWidth + 1);
  await page.screenshot({ path: "artifacts/country-editor/production-desktop.png", fullPage: true });

  await page.getByRole("tab", { name: "Settlements +", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(100);
  const mobileLayout = await page.evaluate(() => {
    const grid = document.querySelector(".settlement-card-grid");
    return {
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      settlementColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0
    };
  });
  assert.ok(mobileLayout.bodyScrollWidth <= mobileLayout.viewportWidth + 1);
  assert.equal(mobileLayout.settlementColumns, 1);
  await page.screenshot({ path: "artifacts/country-editor/settlements-mobile.png", fullPage: true });

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}

async function createCountry(name, shortName, settlements) {
  await page.getByRole("button", { name: "Country", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Short sidebar name", { exact: true }).fill(shortName);
  await page.getByPlaceholder("One settlement name per line").fill(settlements);
  await page.getByRole("button", { name: "Create Country", exact: true }).click();
  await page.locator("h2").filter({ hasText: "Create Country" }).waitFor({ state: "detached" });
}
