import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ALLOWED_THREAD_URLS, fetchDiscordStatSheetBundle } from "./discord-stat-sheet-service.mjs";

const DEFAULT_OUTPUT = ".tmp/discord-stat-sheets-import.json";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    out: DEFAULT_OUTPUT,
    threads: ALLOWED_THREAD_URLS,
    aliasMap: ""
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--out") {
      options.out = args[index + 1] ?? "";
      index += 1;
    } else if (arg === "--thread-url") {
      options.threads = [args[index + 1] ?? ""];
      index += 1;
    } else if (arg === "--alias-map") {
      options.aliasMap = args[index + 1] ?? "";
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: DISCORD_BOT_TOKEN=... node scripts/fetch-discord-stat-sheets.mjs [--out path] [--thread-url allowed-url] [--alias-map path]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.out) throw new Error("--out requires a path.");
  return options;
};

const main = async () => {
  const options = parseArgs();
  const bundle = await fetchDiscordStatSheetBundle({
    threadUrls: options.threads,
    countryAliases: options.aliasMap || undefined,
    logger: (message) => console.log(message)
  });
  const outputPath = path.resolve(options.out);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  const blocking = bundle.report.errors.length;
  const warnings = bundle.report.warnings.length;
  console.log(`Wrote ${outputPath}`);
  console.log(`Parsed ${bundle.sheets.length} sheets with ${blocking} blocking errors and ${warnings} warnings.`);
  if (blocking > 0) {
    console.log(`First fix: ${bundle.report.errors[0].suggestedFix}`);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
