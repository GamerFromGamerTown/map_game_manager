import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

const DISCORD_STAT_SHEET_ENDPOINT = "/api/import/discord-stat-sheets";

type DiscordImportModule = {
  fetchDiscordStatSheetBundle: () => Promise<unknown>;
};

const jsonResponse = (response: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void }, statusCode: number, body: unknown) => {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
};

const messageForError = (error: unknown): { statusCode: number; message: string } => {
  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record?.code === "string" ? record.code : "";
  const message = typeof record?.message === "string" ? record.message : "Discord stat-sheet import failed.";

  if (code === "missing-token") return { statusCode: 401, message };
  if (code === "discord-fetch-failed") return { statusCode: 502, message };
  if (code === "invalid-thread") return { statusCode: 400, message };
  if (code === "parser-build-failed") return { statusCode: 500, message };
  return { statusCode: 500, message: "Local Discord stat-sheet import failed. Check the dev server console for details." };
};

const localDiscordStatSheetImport = (): Plugin => ({
  name: "local-discord-stat-sheet-import",
  configureServer(server) {
    server.middlewares.use(DISCORD_STAT_SHEET_ENDPOINT, async (request, response) => {
      const method = (request as { method?: string }).method;
      if (method !== "POST") {
        jsonResponse(response, 405, { error: "Use POST to import Discord stat sheets." });
        return;
      }

      try {
        const service = (await import(new URL("./scripts/discord-stat-sheet-service.mjs", import.meta.url).href)) as DiscordImportModule;
        const bundle = await service.fetchDiscordStatSheetBundle();
        jsonResponse(response, 200, bundle);
      } catch (error) {
        console.error(error);
        const result = messageForError(error);
        jsonResponse(response, result.statusCode, { error: result.message });
      }
    });
  }
});

export default defineConfig({
  plugins: [react(), localDiscordStatSheetImport()],
  server: {
    port: 5173
  }
});
