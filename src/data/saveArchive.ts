import type { GameState } from "../types";
import { normalizeLoadedState } from "./migrations";
import { validateGameState } from "./validation";

export const SAVE_ARCHIVE_KIND = "gm-economy-console-save-archive";
export const SAVE_ARCHIVE_VERSION = 1;
export const SAVE_ARCHIVE_MIME = "application/vnd.gm-economy-console.save+zip";

const ARCHIVE_FILE_ORDER = [
  "manifest.json",
  "countries.json",
  "resources.json",
  "settings.json",
  "aliases.json",
  "diplomacy.json",
  "trades.json",
  "rules.json",
  "military.json",
  "history.json"
] as const;

type ArchiveFileName = (typeof ARCHIVE_FILE_ORDER)[number];

export interface LoadedSaveArchive {
  state: GameState;
  format: "archive";
  formatLabel: string;
  warnings: string[];
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const uniqueStrings = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)])
  );
};

const stableJson = (value: unknown): Uint8Array =>
  encoder.encode(`${JSON.stringify(stableValue(value), null, 2)}\n`);

const readJson = (entries: Map<string, Uint8Array>, name: ArchiveFileName): unknown => {
  const data = entries.get(name);
  if (!data) throw new Error(`Save archive is missing ${name}.`);
  return JSON.parse(decoder.decode(data)) as unknown;
};

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
};

const asArray = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const concatBytes = (chunks: Uint8Array[]): Uint8Array => {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
};

const u16 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
};

const u32 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
};

const DOS_DATE_1980_01_01 = 0x0021;
const DOS_TIME_00_00_00 = 0;

const createZip = (entries: ZipEntry[]): Uint8Array => {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const localHeader = concatBytes([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(DOS_TIME_00_00_00),
      u16(DOS_DATE_1980_01_01),
      u32(crc),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(name.length),
      u16(0),
      name
    ]);
    localChunks.push(localHeader, entry.data);

    centralChunks.push(
      concatBytes([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(DOS_TIME_00_00_00),
        u16(DOS_DATE_1980_01_01),
        u32(crc),
        u32(entry.data.length),
        u32(entry.data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name
      ])
    );
    offset += localHeader.length + entry.data.length;
  }

  const centralDirectory = concatBytes(centralChunks);
  const endOfCentralDirectory = concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0)
  ]);

  return concatBytes([...localChunks, centralDirectory, endOfCentralDirectory]);
};

const readUint16 = (view: DataView, offset: number): number => view.getUint16(offset, true);
const readUint32 = (view: DataView, offset: number): number => view.getUint32(offset, true);

const findEndOfCentralDirectory = (bytes: Uint8Array): number => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minOffset = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (readUint32(view, offset) === 0x06054b50) return offset;
  }
  throw new Error("Save archive is not a readable ZIP archive.");
};

const readZip = (bytes: Uint8Array): Map<string, Uint8Array> => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const entryCount = readUint16(view, eocdOffset + 10);
  let centralOffset = readUint32(view, eocdOffset + 16);
  const entries = new Map<string, Uint8Array>();

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, centralOffset) !== 0x02014b50) {
      throw new Error("Save archive central directory is malformed.");
    }
    const method = readUint16(view, centralOffset + 10);
    if (method !== 0) {
      throw new Error("Save archive uses compressed entries; only stored ZIP entries are supported.");
    }
    const expectedCrc = readUint32(view, centralOffset + 16);
    const compressedSize = readUint32(view, centralOffset + 20);
    const fileNameLength = readUint16(view, centralOffset + 28);
    const extraLength = readUint16(view, centralOffset + 30);
    const commentLength = readUint16(view, centralOffset + 32);
    const localOffset = readUint32(view, centralOffset + 42);
    const name = decoder.decode(bytes.slice(centralOffset + 46, centralOffset + 46 + fileNameLength));

    if (readUint32(view, localOffset) !== 0x04034b50) {
      throw new Error(`Save archive local header for ${name} is malformed.`);
    }
    const localNameLength = readUint16(view, localOffset + 26);
    const localExtraLength = readUint16(view, localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.slice(dataOffset, dataOffset + compressedSize);
    if (crc32(data) !== expectedCrc) {
      throw new Error(`Save archive entry ${name} failed its checksum.`);
    }
    entries.set(name, data);
    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
};

const aliasEntriesForState = (state: GameState) => ({
  countryAliases: state.countries.map((country) => ({
    country_id: country.id,
    country_name: country.name,
    short_name: country.short_name ?? "",
    aliases: country.aliases ?? []
  }))
});

const archiveFilesForState = (state: GameState): Record<ArchiveFileName, unknown> => ({
  "manifest.json": {
    kind: SAVE_ARCHIVE_KIND,
    save_format_version: SAVE_ARCHIVE_VERSION,
    app_schema_version: state.schemaVersion,
    compatibility: {
      minimum_app_schema_version: 2,
      legacy_json_schema_version: 2,
      migration: "legacy monolithic JSON saves are split into domain files when exported as an archive"
    },
    files: [...ARCHIVE_FILE_ORDER]
  },
  "countries.json": {
    countries: state.countries,
    policies: state.policies
  },
  "resources.json": {
    settlements: state.settlements,
    factories: state.factories,
    stockpiles: state.stockpiles
  },
  "settings.json": {
    schemaVersion: state.schemaVersion,
    turnNumber: state.turnNumber,
    graphPositions: state.graphPositions
  },
  "aliases.json": aliasEntriesForState(state),
  "diplomacy.json": {
    diplomacy: state.diplomacy,
    puppets: state.puppets
  },
  "trades.json": {
    trades: state.trades
  },
  "rules.json": {
    rules: state.rules
  },
  "military.json": {
    operations: state.operations,
    diceRolls: state.diceRolls
  },
  "history.json": {
    turnLogs: state.turnLogs,
    overrides: state.overrides
  }
});

export const exportGameStateArchiveBytes = (state: GameState): Uint8Array =>
  createZip(
    ARCHIVE_FILE_ORDER.map((name) => ({
      name,
      data: stableJson(archiveFilesForState(state)[name])
    }))
  );

export const exportGameStateArchiveBlob = (state: GameState): Blob => {
  const bytes = exportGameStateArchiveBytes(state);
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: SAVE_ARCHIVE_MIME });
};

const mergeAliasesIntoCountries = (state: GameState, aliasesFile: unknown): GameState => {
  const aliases = asArray(asRecord(aliasesFile, "aliases.json").countryAliases, "aliases.json.countryAliases");
  const byId = new Map<string, Record<string, unknown>>();
  const byName = new Map<string, Record<string, unknown>>();

  aliases.forEach((entryValue) => {
    const entry = asRecord(entryValue, "aliases.json.countryAliases[]");
    if (typeof entry.country_id === "string") byId.set(entry.country_id, entry);
    if (typeof entry.country_name === "string") byName.set(entry.country_name, entry);
  });

  return {
    ...state,
    countries: state.countries.map((country) => {
      const entry = byId.get(country.id) ?? byName.get(country.name);
      if (!entry) return country;
      const aliasValues = Array.isArray(entry.aliases)
        ? entry.aliases.filter((value): value is string => typeof value === "string")
        : [];
      const shortName = typeof entry.short_name === "string" && entry.short_name.trim()
        ? entry.short_name.trim()
        : country.short_name;
      const aliases = uniqueStrings(aliasValues);
      return {
        ...country,
        short_name: shortName,
        aliases: aliases.length > 0 ? aliases : undefined
      };
    })
  };
};

export const importGameStateArchiveBytes = (bytes: Uint8Array): LoadedSaveArchive => {
  const entries = readZip(bytes);
  const manifest = asRecord(readJson(entries, "manifest.json"), "manifest.json");
  if (manifest.kind !== SAVE_ARCHIVE_KIND || manifest.save_format_version !== SAVE_ARCHIVE_VERSION) {
    throw new Error("Unsupported save archive format or version.");
  }

  const countries = asRecord(readJson(entries, "countries.json"), "countries.json");
  const resources = asRecord(readJson(entries, "resources.json"), "resources.json");
  const settings = asRecord(readJson(entries, "settings.json"), "settings.json");
  const aliases = readJson(entries, "aliases.json");
  const diplomacy = asRecord(readJson(entries, "diplomacy.json"), "diplomacy.json");
  const trades = asRecord(readJson(entries, "trades.json"), "trades.json");
  const rules = asRecord(readJson(entries, "rules.json"), "rules.json");
  const military = asRecord(readJson(entries, "military.json"), "military.json");
  const history = asRecord(readJson(entries, "history.json"), "history.json");

  const state = mergeAliasesIntoCountries(
    {
      schemaVersion: Number(settings.schemaVersion),
      turnNumber: Number(settings.turnNumber),
      rules: rules.rules as GameState["rules"],
      countries: asArray(countries.countries, "countries.json.countries") as GameState["countries"],
      settlements: asArray(resources.settlements, "resources.json.settlements") as GameState["settlements"],
      factories: asArray(resources.factories, "resources.json.factories") as GameState["factories"],
      stockpiles: asArray(resources.stockpiles, "resources.json.stockpiles") as GameState["stockpiles"],
      policies: asArray(countries.policies, "countries.json.policies") as GameState["policies"],
      diplomacy: asArray(diplomacy.diplomacy, "diplomacy.json.diplomacy") as GameState["diplomacy"],
      puppets: asArray(diplomacy.puppets, "diplomacy.json.puppets") as GameState["puppets"],
      trades: asArray(trades.trades, "trades.json.trades") as GameState["trades"],
      operations: asArray(military.operations, "military.json.operations") as GameState["operations"],
      diceRolls: asArray(military.diceRolls, "military.json.diceRolls") as GameState["diceRolls"],
      turnLogs: asArray(history.turnLogs, "history.json.turnLogs") as GameState["turnLogs"],
      overrides: asArray(history.overrides, "history.json.overrides") as GameState["overrides"],
      graphPositions: asRecord(settings.graphPositions, "settings.json.graphPositions") as GameState["graphPositions"]
    },
    aliases
  );

  const normalized = normalizeLoadedState(state);
  validateGameState(normalized);
  return {
    state: normalized,
    format: "archive",
    formatLabel: "Structured save archive",
    warnings: []
  };
};
