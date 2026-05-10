import { execFile } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";

const execFileAsync = promisify(execFile);

const DISCORD_API_BASE = "https://discord.com/api/v10";
const REQUEST_DELAY_MS = 1250;
const MESSAGE_PAGE_LIMIT = String(Math.max(1, Math.min(100, Number(process.env.DISCORD_MESSAGE_LIMIT ?? 100))));
const SECRET_IMPORTER_PATH = path.resolve("secrets_importer.sh");

export const ALLOWED_THREAD_URLS = [
  "https://discord.com/channels/1131858833438937130/1498805743766474973/threads/1499127265177501890",
  "https://discord.com/channels/1131858833438937130/1498805743766474973/threads/1499579906818838538",
  "https://discord.com/channels/1131858833438937130/1498805743766474973/threads/1498806397482176763",
  "https://discord.com/channels/1131858833438937130/1498805743766474973/threads/1498991793155608650",
  "https://discord.com/channels/1131858833438937130/1498805743766474973/threads/1498812335907799180",
  "https://discord.com/channels/1131858833438937130/1498805743766474973/threads/1499251334908739724",
  "https://discord.com/channels/1131858833438937130/1498805743766474973/threads/1499208293082468464",
  "https://discord.com/channels/1131858833438937130/1498805743766474973/threads/1499164208380645436",
  "https://discord.com/channels/1131858833438937130/1498805743766474973/threads/1499040192722632877"
];

const ALLOWED_GUILD_ID = "1131858833438937130";
const ALLOWED_PARENT_CHANNEL_ID = "1498805743766474973";

export class DiscordStatSheetImportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DiscordStatSheetImportError";
    this.code = code;
  }
}

export const isDiscordStatSheetImportError = (error) => error instanceof DiscordStatSheetImportError;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const parseThreadUrl = (url) => {
  if (!ALLOWED_THREAD_URLS.includes(url)) {
    throw new DiscordStatSheetImportError(
      "invalid-thread",
      `Refusing to fetch non-allowlisted Discord thread URL: ${url}`
    );
  }

  const parsed = new URL(url);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const [channels, guildId, parentChannelId, threads, threadId] = parts;
  if (
    parsed.hostname !== "discord.com" ||
    channels !== "channels" ||
    guildId !== ALLOWED_GUILD_ID ||
    parentChannelId !== ALLOWED_PARENT_CHANNEL_ID ||
    threads !== "threads" ||
    !threadId
  ) {
    throw new DiscordStatSheetImportError(
      "invalid-thread",
      `Discord thread URL does not match the approved guild/channel/thread shape: ${url}`
    );
  }

  return { url, guildId, parentChannelId, threadId };
};

export const resolveDiscordBotToken = async () => {
  const envToken = process.env.DISCORD_BOT_TOKEN?.trim();
  if (envToken) return envToken;

  try {
    await access(SECRET_IMPORTER_PATH);
    const { stdout } = await execFileAsync("bash", [SECRET_IMPORTER_PATH], {
      timeout: 5000,
      maxBuffer: 1024 * 1024
    });
    const token = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1);
    if (token) return token;
  } catch {
    // Fall through to the explicit missing-token error below.
  }

  throw new DiscordStatSheetImportError(
    "missing-token",
    "Discord token is missing on the local dev server. Set DISCORD_BOT_TOKEN before running npm run dev, or configure secrets_importer.sh."
  );
};

const normalizeAliasEntry = (entry) => {
  if (!entry || typeof entry !== "object") return undefined;
  const countryName = typeof entry.country_name === "string" ? entry.country_name.trim() : "";
  const aliases = Array.isArray(entry.aliases)
    ? entry.aliases.map((alias) => (typeof alias === "string" ? alias.trim() : "")).filter(Boolean)
    : [];
  return countryName && aliases.length > 0 ? { country_name: countryName, aliases } : undefined;
};

const normalizeAliasMap = (value) => {
  const rawEntries = Array.isArray(value)
    ? value
    : Array.isArray(value?.countryAliases)
      ? value.countryAliases
      : value && typeof value === "object"
        ? Object.entries(value).map(([country_name, aliases]) => ({ country_name, aliases }))
        : [];
  return rawEntries.map(normalizeAliasEntry).filter(Boolean);
};

const loadCountryAliases = async (explicitAliases) => {
  if (Array.isArray(explicitAliases)) return normalizeAliasMap(explicitAliases);
  const aliasMapPath = typeof explicitAliases === "string" && explicitAliases.trim() ? explicitAliases.trim() : "";
  if (!aliasMapPath) return [];
  const text = await readFile(path.resolve(aliasMapPath), "utf8");
  return normalizeAliasMap(JSON.parse(text));
};

const compileParser = async () => {
  const outfile = path.resolve(".tmp/stat-sheet-parser-bundle.mjs");
  await mkdir(path.dirname(outfile), { recursive: true });
  try {
    await build({
      entryPoints: ["src/import/statSheetParser.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile,
      logLevel: "silent"
    });
  } catch (error) {
    throw new DiscordStatSheetImportError(
      "parser-build-failed",
      error instanceof Error ? `Local stat-sheet parser build failed: ${error.message}` : "Local stat-sheet parser build failed."
    );
  }
  return import(`${pathToFileURL(outfile).href}?mtime=${Date.now()}`);
};

const discordGet = async (pathSuffix, token) => {
  const url = `${DISCORD_API_BASE}${pathSuffix}`;
  for (;;) {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: token,
        "User-Agent": "gm-economy-console-stat-sheet-fetcher"
      }
    });

    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      const retryAfterSeconds = Number(body.retry_after ?? response.headers.get("retry-after") ?? 2);
      await sleep(Math.ceil(retryAfterSeconds * 1000) + 250);
      continue;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new DiscordStatSheetImportError(
        "discord-fetch-failed",
        `Discord fetch failed for ${pathSuffix} with HTTP ${response.status}. Check bot access and thread permissions. ${body.slice(0, 200)}`
      );
    }

    return response.json();
  }
};

const fetchThreadMessages = async (threadId, token) => {
  const messages = [];
  let before = "";

  for (;;) {
    const query = new URLSearchParams({ limit: MESSAGE_PAGE_LIMIT });
    if (before) query.set("before", before);
    const page = await discordGet(`/channels/${threadId}/messages?${query.toString()}`, token);
    if (!Array.isArray(page)) {
      throw new DiscordStatSheetImportError(
        "discord-fetch-failed",
        `Discord returned a non-array message page for thread ${threadId}.`
      );
    }
    messages.push(...page);
    if (page.length < Number(MESSAGE_PAGE_LIMIT)) break;
    before = page[page.length - 1].id;
    await sleep(REQUEST_DELAY_MS);
  }

  return messages.sort((left, right) => (BigInt(left.id) < BigInt(right.id) ? -1 : 1));
};

const fetchThreadMeta = async (threadId, token) => {
  const channel = await discordGet(`/channels/${threadId}`, token);
  return {
    name: typeof channel?.name === "string" ? channel.name : ""
  };
};

const mentionAliases = (mention) =>
  Array.from(
    new Set(
      [mention?.member?.nick, mention?.global_name, mention?.username]
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );

const messageToText = (message) => {
  const rawContent = typeof message.content === "string" ? message.content : "";
  const mentions = Array.isArray(message.mentions) ? message.mentions : [];
  const content = rawContent.replace(/<@!?(\d+)>/g, (token, id) => {
    const aliases = mentionAliases(mentions.find((mention) => mention?.id === id));
    return aliases.length > 0 ? aliases.map((alias) => `@${alias}`).join(", ") : token;
  });
  const attachmentLines = Array.isArray(message.attachments)
    ? message.attachments
        .map((attachment) => attachment?.url)
        .filter((url) => typeof url === "string" && url.length > 0)
        .map((url) => `[attachment] ${url}`)
    : [];
  return [content, ...attachmentLines].filter(Boolean).join("\n");
};

export const fetchDiscordStatSheetBundle = async ({
  token,
  threadUrls = ALLOWED_THREAD_URLS,
  countryAliases,
  logger = () => {}
} = {}) => {
  const resolvedToken = token ?? (await resolveDiscordBotToken());
  const aliases = await loadCountryAliases(countryAliases);
  const threads = threadUrls.map(parseThreadUrl);
  const { buildStatSheetBundleFromTexts } = await compileParser();
  const sources = [];

  for (const thread of threads) {
    logger(`Fetching allowlisted thread ${thread.threadId}`);
    const meta = await fetchThreadMeta(thread.threadId, resolvedToken);
    const messages = await fetchThreadMessages(thread.threadId, resolvedToken);
    const content = messages.map(messageToText).filter(Boolean).join("\n\n");
    sources.push({
      threadId: thread.threadId,
      threadName: meta.name,
      url: thread.url,
      messageCount: messages.length,
      content
    });
    await sleep(REQUEST_DELAY_MS);
  }

  const bundle = buildStatSheetBundleFromTexts(sources);
  if (aliases.length > 0) {
    bundle.countryAliases = aliases;
  }
  return bundle;
};
