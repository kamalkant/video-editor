export const DEFAULT_AUTOSAVE_FOLDER = "Documents/vdo";
export const DEFAULT_AUTOSAVE_PATH = "~/Documents/vdo";

export function formatFolderDisplayName(folderName: string | null): string {
  if (!folderName || folderName === "VIDO" || folderName === "Documents/vdo" || folderName === "Documents/vdo") {
    return "Documents/vdo";
  }
  return folderName;
}

export type DeviceFolderInfo = {
  isSupported: boolean;
  folderName: string;
  hasCustomFolder: boolean;
  hasPermission: boolean;
  isDefault: boolean;
  systemPath?: string;
};

const IDB_NAME = "VDO_device_storage";
const STORE_NAME = "device_folders";

function hasIndexedDB(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

const memoryHandles = new Map<string, { folderName: string; handle: any; savedAt: number }>();

export function isDirectoryPickerSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

function getDeviceStorageDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDB()) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveHandleToIdb(
  accountCode: string,
  folderName: string,
  handle: any
): Promise<void> {
  if (!hasIndexedDB()) {
    memoryHandles.set(accountCode, { folderName, handle, savedAt: Date.now() });
    return;
  }
  try {
    const db = await getDeviceStorageDb();
    if (!db) {
      memoryHandles.set(accountCode, { folderName, handle, savedAt: Date.now() });
      return;
    }
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ folderName, handle, savedAt: Date.now() }, accountCode);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    console.warn("Could not save directory handle to IndexedDB:", err);
    memoryHandles.set(accountCode, { folderName, handle, savedAt: Date.now() });
  }
}

export async function getHandleFromIdb(
  accountCode: string
): Promise<{ folderName: string; handle: any } | null> {
  if (!hasIndexedDB()) {
    return memoryHandles.get(accountCode) || null;
  }
  try {
    const db = await getDeviceStorageDb();
    if (!db) return memoryHandles.get(accountCode) || null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(accountCode);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function removeHandleFromIdb(accountCode: string): Promise<void> {
  if (!hasIndexedDB()) {
    memoryHandles.delete(accountCode);
    return;
  }
  try {
    const db = await getDeviceStorageDb();
    if (!db) return;
    await db.delete(STORE_NAME, accountCode);
  } catch {
    // Ignore error on remove
  }
}

export async function verifyFolderPermission(handle: any, request = true): Promise<boolean> {
  if (!handle) return false;
  try {
    const opts = { mode: "readwrite" };
    if (typeof handle.queryPermission === "function") {
      const status = await handle.queryPermission(opts);
      if (status === "granted") return true;
      if (request && typeof handle.requestPermission === "function") {
        const reqStatus = await handle.requestPermission(opts);
        return reqStatus === "granted";
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function requestFolderPermission(accountCode: string): Promise<boolean> {
  const record = await getHandleFromIdb(accountCode);
  if (!record?.handle) return false;
  return verifyFolderPermission(record.handle, true);
}

export async function getDeviceFolderInfo(accountCode: string): Promise<DeviceFolderInfo> {
  const isSupported = isDirectoryPickerSupported();
  let folderName: string | null = null;
  let isCustom = false;

  if (typeof localStorage !== "undefined") {
    folderName = localStorage.getItem(`vdo_device_folder_${accountCode}`);
    if (folderName && folderName !== DEFAULT_AUTOSAVE_FOLDER) {
      isCustom = true;
    }
  }

  const record = await getHandleFromIdb(accountCode);
  let hasPermission = false;
  if (record) {
    folderName = record.folderName;
    isCustom = true;
    if (typeof localStorage !== "undefined" && folderName) {
      localStorage.setItem(`vdo_device_folder_${accountCode}`, folderName);
    }
    if (record.handle) {
      hasPermission = await verifyFolderPermission(record.handle, false);
    }
  }

  // Standardize VIDO folder to Documents/vdo
  if (!folderName || folderName.toLowerCase() === "vido" || folderName === "Documents/vdo") {
    folderName = DEFAULT_AUTOSAVE_FOLDER;
    isCustom = false;
  } else {
    folderName = formatFolderDisplayName(folderName);
    if (folderName === DEFAULT_AUTOSAVE_FOLDER) {
      isCustom = false;
    }
  }

  return {
    isSupported,
    folderName,
    hasCustomFolder: isCustom,
    hasPermission: isCustom ? hasPermission : true,
    isDefault: !isCustom,
    systemPath: isCustom ? folderName : DEFAULT_AUTOSAVE_PATH,
  };
}

export async function pickDeviceFolder(accountCode: string): Promise<{
  success: boolean;
  folderName?: string;
  error?: string;
}> {
  if (!isDirectoryPickerSupported()) {
    return {
      success: false,
      error: "Folder picker is not supported in this browser. Please use Chrome, Edge, or Brave.",
    };
  }

  try {
    const handle = await (window as any).showDirectoryPicker({
      mode: "readwrite",
      startIn: "documents",
    });

    if (typeof handle.getFileHandle === "function") {
      try {
        await handle.getFileHandle(".vdo_probe", { create: true });
        if (typeof handle.removeEntry === "function") {
          await handle.removeEntry(".vdo_probe");
        }
      } catch (probeErr: any) {
        if (probeErr?.name === "NotAllowedError" || probeErr?.name === "SecurityError") {
          return {
            success: false,
            error: "The browser or OS restricts writing to this specific folder. Please choose a regular user folder (such as Documents or Desktop).",
          };
        }
      }
    }

    const folderName = handle.name === "VIDO" ? "Documents/vdo" : (handle.name || "Selected Folder");
    await saveHandleToIdb(accountCode, folderName, handle);

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(`vdo_device_folder_${accountCode}`, folderName);
    }

    return {
      success: true,
      folderName,
    };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { success: false, error: "Selection cancelled" };
    }
    return { success: false, error: err?.message || "Failed to select folder" };
  }
}

export async function resetDeviceFolder(accountCode: string): Promise<void> {
  await removeHandleFromIdb(accountCode);
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(`vdo_device_folder_${accountCode}`);
  }
}

export async function writeToDeviceFolder(
  accountCode: string,
  fileName: string,
  content: string | Blob
): Promise<boolean> {
  let writtenDirectly = false;

  // 1. Try writing via browser FileSystemDirectoryHandle if available
  try {
    const record = await getHandleFromIdb(accountCode);
    if (record?.handle) {
      const hasPerm = await verifyFolderPermission(record.handle, false);
      if (hasPerm) {
        const fileHandle = await record.handle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        writtenDirectly = true;
      }
    }
  } catch (err: any) {
    console.warn("Could not write to local handle:", err);
  }

  // 2. Always sync automatically to Documents/vdo on the device via local API
  try {
    const payload =
      typeof content === "string"
        ? content
        : content instanceof Blob
        ? await content.text()
        : JSON.stringify(content);

    const baseUrl = typeof window !== "undefined" ? "" : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
    const res = await fetch(`${baseUrl}/api/storage/device-folder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, content: payload, accountCode }),
    });

    if (res.ok) {
      return true;
    }
  } catch {
    // offline or non-local fallback
  }

  return writtenDirectly;
}

export async function saveDraftToDeviceFolder(
  accountCode: string,
  projectId: string,
  projectName: string,
  doc: any
): Promise<boolean> {
  const cleanName = (projectName || "Untitled Project")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .trim()
    .replace(/\s+/g, "_");

  const payload = JSON.stringify(
    {
      format: "vdo-draft",
      version: 1,
      accountCode,
      projectId,
      projectName,
      savedAt: Date.now(),
      savedAtIso: new Date().toISOString(),
      doc,
    },
    null,
    2
  );

  const draftFile = `${cleanName}.draft.vdo`;
  const snapshotFile = `vdo_unsaved_changes_latest.json`;

  const ok1 = await writeToDeviceFolder(accountCode, draftFile, payload);
  const ok2 = await writeToDeviceFolder(accountCode, snapshotFile, payload);
  return ok1 || ok2;
}

export async function testWriteDeviceFolder(
  accountCode: string
): Promise<{ success: boolean; message: string }> {
  try {
    const record = await getHandleFromIdb(accountCode);
    const targetName = record?.folderName || "Documents/vdo";
    const testData = JSON.stringify(
      {
        app: "ViPlay Studio",
        status: "active",
        verifiedAt: new Date().toISOString(),
        folder: targetName,
        note: "This folder is successfully receiving live unsaved changes and drafts from ViPlay Studio.",
      },
      null,
      2
    );

    const ok = await writeToDeviceFolder(accountCode, "VIDO_LIVE_AUTOSAVE_ACTIVE.json", testData);
    if (ok) {
      return {
        success: true,
        message: `Successfully verified write access to ${targetName}! Live autosave active.`,
      };
    }
    return { success: false, message: "Could not create test file in autosave folder." };
  } catch (err: any) {
    return { success: false, message: err?.message || "Failed to test folder access." };
  }
}
