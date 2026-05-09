type FilePickerAcceptType = {
  description?: string;
  accept: Record<string, string[]>;
};

type FilePickerOptions = {
  multiple?: boolean;
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
};

type FileSystemPermissionMode = "read" | "readwrite";
type FileSystemPermissionState = "granted" | "denied" | "prompt";

type FileSystemHandlePermissionDescriptor = {
  mode?: FileSystemPermissionMode;
};

export type RememberedSaveFileHandle = {
  kind: "file";
  name: string;
  getFile: () => Promise<File>;
  queryPermission?: (descriptor?: FileSystemHandlePermissionDescriptor) => Promise<FileSystemPermissionState>;
  requestPermission?: (descriptor?: FileSystemHandlePermissionDescriptor) => Promise<FileSystemPermissionState>;
};

type FilePickerWindow = Window & {
  showOpenFilePicker?: (options?: FilePickerOptions) => Promise<RememberedSaveFileHandle[]>;
};

export type RememberedSave = {
  key: "remembered-save";
  name: string;
  handle: RememberedSaveFileHandle;
};

const DB_NAME = "gm-economy-console-file-handles";
const DB_VERSION = 1;
const STORE_NAME = "handles";
const REMEMBERED_SAVE_KEY = "remembered-save";

const openHandleDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to open file handle storage."));
    request.onsuccess = () => resolve(request.result);
  });

const withStore = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => {
  const db = await openHandleDb();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));

    request.onerror = () => reject(request.error ?? new Error("Unable to update file handle storage."));
    request.onsuccess = () => resolve(request.result);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("Unable to update file handle storage."));
    };
  });
};

export const canRememberSaveFiles = () => {
  if (typeof window === "undefined") return false;
  const pickerWindow = window as FilePickerWindow;
  return Boolean(window.indexedDB && pickerWindow.showOpenFilePicker);
};

export const getRememberedSave = async (): Promise<RememberedSave | null> => {
  if (!canRememberSaveFiles()) return null;
  const saved = (await withStore<RememberedSave | undefined>("readonly", (store) => store.get(REMEMBERED_SAVE_KEY))) ?? null;
  if (!saved) return null;
  if (!saved.name.toLowerCase().endsWith(".json")) {
    await clearRememberedSave();
    return null;
  }
  return saved;
};

export const setRememberedSave = async (save: Omit<RememberedSave, "key">) => {
  await withStore<IDBValidKey>("readwrite", (store) => store.put({ ...save, key: REMEMBERED_SAVE_KEY }));
};

export const clearRememberedSave = async () => {
  if (typeof window === "undefined") return;
  if (!window.indexedDB) return;
  await withStore<undefined>("readwrite", (store) => store.delete(REMEMBERED_SAVE_KEY));
};

export const pickRememberedSave = async (): Promise<Omit<RememberedSave, "key"> | null> => {
  const pickerWindow = window as FilePickerWindow;
  if (!pickerWindow.showOpenFilePicker) return null;

  const [handle] = await pickerWindow.showOpenFilePicker({
    multiple: false,
    types: [
      {
        description: "GM JSON backup files",
        accept: {
          "application/json": [".json"]
        }
      }
    ]
  });

  if (!handle) return null;
  return { name: handle.name, handle };
};

export const hasRememberedSaveReadPermission = async (handle: RememberedSaveFileHandle) => {
  if (!handle.queryPermission) return true;
  return (await handle.queryPermission({ mode: "read" })) === "granted";
};

export const requestRememberedSaveReadPermission = async (handle: RememberedSaveFileHandle) => {
  if (await hasRememberedSaveReadPermission(handle)) return true;
  if (!handle.requestPermission) return false;
  return (await handle.requestPermission({ mode: "read" })) === "granted";
};
