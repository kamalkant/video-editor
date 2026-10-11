import type {
  AccountRecord,
  RecoverySnapshot,
  StoredAsset,
  StoredProject,
} from "./types";

const DB_NAME = "VDO_local_first_db";
const DB_VERSION = 1;

export interface FallbackBlobRecord {
  id: string; // key e.g. "accountCode:assetId" or "accountCode:thumbId"
  accountCode: string;
  blob: Blob;
  size: number;
  mimeType: string;
  updatedAt: number;
}

// In-memory fallback stores for non-browser (Node / SSR / test) environments
const memoryStores = {
  accounts: new Map<string, AccountRecord>(),
  projects: new Map<string, StoredProject>(),
  assets: new Map<string, StoredAsset>(),
  recovery: new Map<string, RecoverySnapshot>(),
  blobs: new Map<string, FallbackBlobRecord>(),
};

function hasIndexedDB(): boolean {
  return (
    typeof window !== "undefined" && typeof window.indexedDB !== "undefined"
  );
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function getLocalDb(): Promise<IDBDatabase> {
  if (!hasIndexedDB()) {
    throw new Error("IndexedDB is not supported in this environment");
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      // 1. Accounts store
      if (!db.objectStoreNames.contains("accounts")) {
        db.createObjectStore("accounts", { keyPath: "accountCode" });
      }

      // 2. Projects store
      if (!db.objectStoreNames.contains("projects")) {
        const store = db.createObjectStore("projects", { keyPath: "id" });
        store.createIndex("accountCode", "accountCode", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
        store.createIndex("by_account_updated", ["accountCode", "updatedAt"], {
          unique: false,
        });
      }

      // 3. Assets store
      if (!db.objectStoreNames.contains("assets")) {
        const store = db.createObjectStore("assets", { keyPath: "id" });
        store.createIndex("accountCode", "accountCode", { unique: false });
        store.createIndex("hash", "hash", { unique: false });
        store.createIndex("by_account_hash", ["accountCode", "hash"], {
          unique: false,
        });
      }

      // 4. Recovery store
      if (!db.objectStoreNames.contains("recovery")) {
        const store = db.createObjectStore("recovery", { keyPath: "id" });
        store.createIndex("accountCode", "accountCode", { unique: false });
        store.createIndex("savedAt", "savedAt", { unique: false });
        store.createIndex("by_account_project", ["accountCode", "projectId"], {
          unique: false,
        });
      }

      // 5. Fallback blob store (for OPFS-less browsers or thumbnails)
      if (!db.objectStoreNames.contains("blobs")) {
        const store = db.createObjectStore("blobs", { keyPath: "id" });
        store.createIndex("accountCode", "accountCode", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

// ----------------- Account Operations -----------------

export async function dbSaveAccount(account: AccountRecord): Promise<void> {
  if (!hasIndexedDB()) {
    memoryStores.accounts.set(account.accountCode, account);
    return;
  }
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("accounts", "readwrite");
    tx.objectStore("accounts").put(account);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbGetAccount(
  accountCode: string,
): Promise<AccountRecord | null> {
  if (!hasIndexedDB()) {
    return memoryStores.accounts.get(accountCode) ?? null;
  }
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("accounts", "readonly");
    const req = tx.objectStore("accounts").get(accountCode);
    req.onsuccess = () => resolve((req.result as AccountRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

// ----------------- Project Operations (Account Isolated) -----------------

export async function dbSaveProject(project: StoredProject): Promise<void> {
  if (!hasIndexedDB()) {
    memoryStores.projects.set(project.id, project);
    return;
  }
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put(project);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbGetProject(
  id: string,
  accountCode: string,
): Promise<StoredProject | null> {
  if (!hasIndexedDB()) {
    const p = memoryStores.projects.get(id);
    return p && p.accountCode === accountCode ? p : null;
  }
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects", "readonly");
    const req = tx.objectStore("projects").get(id);
    req.onsuccess = () => {
      const res = req.result as StoredProject | undefined;
      if (res && res.accountCode === accountCode) {
        resolve(res);
      } else {
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function dbListProjects(
  accountCode: string,
): Promise<StoredProject[]> {
  if (!hasIndexedDB()) {
    return Array.from(memoryStores.projects.values())
      .filter((p) => p.accountCode === accountCode)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects", "readonly");
    const index = tx.objectStore("projects").index("accountCode");
    const req = index.getAll(accountCode);
    req.onsuccess = () => {
      const list = (req.result as StoredProject[]) || [];
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function dbDeleteProject(
  id: string,
  accountCode: string,
): Promise<boolean> {
  if (!hasIndexedDB()) {
    const p = memoryStores.projects.get(id);
    if (p && p.accountCode === accountCode) {
      memoryStores.projects.delete(id);
      return true;
    }
    return false;
  }
  const db = await getLocalDb();
  // Verify ownership before deleting
  const existing = await dbGetProject(id, accountCode);
  if (!existing) return false;

  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// ----------------- Asset Operations (Account Isolated) -----------------

export async function dbSaveAsset(asset: StoredAsset): Promise<void> {
  if (!hasIndexedDB()) {
    memoryStores.assets.set(asset.id, asset);
    return;
  }
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("assets", "readwrite");
    tx.objectStore("assets").put(asset);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbGetAsset(
  id: string,
  accountCode: string,
): Promise<StoredAsset | null> {
  if (!hasIndexedDB()) {
    const a = memoryStores.assets.get(id);
    return a && a.accountCode === accountCode ? a : null;
  }
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("assets", "readonly");
    const req = tx.objectStore("assets").get(id);
    req.onsuccess = () => {
      const res = req.result as StoredAsset | undefined;
      if (res && res.accountCode === accountCode) {
        resolve(res);
      } else {
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function dbFindAssetByHash(
  hash: string,
  accountCode: string,
): Promise<StoredAsset | null> {
  if (!hasIndexedDB()) {
    for (const a of memoryStores.assets.values()) {
      if (a.accountCode === accountCode && a.hash === hash) return a;
    }
    return null;
  }
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("assets", "readonly");
    const index = tx.objectStore("assets").index("by_account_hash");
    const req = index.get([accountCode, hash]);
    req.onsuccess = () => resolve((req.result as StoredAsset) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function dbListAssets(
  accountCode: string,
): Promise<StoredAsset[]> {
  if (!hasIndexedDB()) {
    return Array.from(memoryStores.assets.values())
      .filter((a) => a.accountCode === accountCode)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("assets", "readonly");
    const index = tx.objectStore("assets").index("accountCode");
    const req = index.getAll(accountCode);
    req.onsuccess = () => {
      const list = (req.result as StoredAsset[]) || [];
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function dbDeleteAsset(
  id: string,
  accountCode: string,
): Promise<boolean> {
  if (!hasIndexedDB()) {
    const a = memoryStores.assets.get(id);
    if (a && a.accountCode === accountCode) {
      memoryStores.assets.delete(id);
      return true;
    }
    return false;
  }
  const db = await getLocalDb();
  const existing = await dbGetAsset(id, accountCode);
  if (!existing) return false;

  return new Promise((resolve, reject) => {
    const tx = db.transaction("assets", "readwrite");
    tx.objectStore("assets").delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// ----------------- Crash Recovery Operations -----------------

export async function dbSaveRecovery(
  recovery: RecoverySnapshot,
): Promise<void> {
  if (!hasIndexedDB()) {
    memoryStores.recovery.set(recovery.id, recovery);
    return;
  }
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("recovery", "readwrite");
    tx.objectStore("recovery").put(recovery);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbGetRecovery(
  projectId: string,
  accountCode: string,
): Promise<RecoverySnapshot | null> {
  if (!hasIndexedDB()) {
    for (const r of memoryStores.recovery.values()) {
      if (r.accountCode === accountCode && r.projectId === projectId) return r;
    }
    return null;
  }
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("recovery", "readonly");
    const index = tx.objectStore("recovery").index("by_account_project");
    const req = index.get([accountCode, projectId]);
    req.onsuccess = () => resolve((req.result as RecoverySnapshot) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function dbClearRecovery(
  projectId: string,
  accountCode: string,
): Promise<void> {
  const existing = await dbGetRecovery(projectId, accountCode);
  if (!existing) return;

  if (!hasIndexedDB()) {
    memoryStores.recovery.delete(existing.id);
    return;
  }
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("recovery", "readwrite");
    tx.objectStore("recovery").delete(existing.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ----------------- Fallback Blob Store Operations -----------------

export async function dbSaveFallbackBlob(
  record: FallbackBlobRecord,
): Promise<void> {
  if (!hasIndexedDB()) {
    memoryStores.blobs.set(record.id, record);
    return;
  }
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("blobs", "readwrite");
    tx.objectStore("blobs").put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbGetFallbackBlob(
  id: string,
  accountCode: string,
): Promise<Blob | null> {
  if (!hasIndexedDB()) {
    const b = memoryStores.blobs.get(id);
    return b && b.accountCode === accountCode ? b.blob : null;
  }
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("blobs", "readonly");
    const req = tx.objectStore("blobs").get(id);
    req.onsuccess = () => {
      const res = req.result as FallbackBlobRecord | undefined;
      if (res && res.accountCode === accountCode) {
        resolve(res.blob);
      } else {
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function dbDeleteFallbackBlob(
  id: string,
  accountCode: string,
): Promise<boolean> {
  if (!hasIndexedDB()) {
    const b = memoryStores.blobs.get(id);
    if (b && b.accountCode === accountCode) {
      memoryStores.blobs.delete(id);
      return true;
    }
    return false;
  }
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("blobs", "readwrite");
    tx.objectStore("blobs").delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
