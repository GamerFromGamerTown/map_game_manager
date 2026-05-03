import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

await mkdir(".tmp", { recursive: true });

await build({
  entryPoints: ["tests/regression.test.ts"],
  outfile: ".tmp/regression-test.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  sourcemap: "inline",
  logLevel: "silent"
});

await import(pathToFileURL(`${process.cwd()}/.tmp/regression-test.mjs`).href);
