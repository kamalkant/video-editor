import {
  dbDeleteFallbackBlob,
  dbGetFallbackBlob,
  dbSaveFallbackBlob,
} from "./db";

/**
 * Origin Private File System (OPFS) Storage Manager
 *
 * Scopes all large binary files (videos, audio, images, generated media, thumbnails)
 * into an account-isolated directory:
 *   /VDO/users/<accountCode>/...
 *
 * If OPFS is not available in the current browser/environment, transparently
 * falls back to IndexedDB blob storage.
 */

export function hasOpfsSupport(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage !== "undefined" &&
    typeof navigator.storage.getDirectory === "function"
  );
}

async function getAccountDirectory(
  accountCode: string,
): Promise<FileSystemDirectoryHandle | null> {
  if (!hasOpfsSupport()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const VDODir = await root.getDirectoryHandle("VDO", { create: true });
    const usersDir = await VDODir.getDirectoryHandle("users", { create: true });
    return await usersDir.getDirectoryHandle(accountCode, { create: true });
  } catch {
    return null;
  }
}

/**
 * Resolves a nested sub-path inside an account directory, creating intermediate folders.
 * e.g. "assets/videos/abc.mp4" -> returns { dirHandle, fileName }
 */
async function resolvePath(
  accountDir: FileSystemDirectoryHandle,
  subpath: string,
  create = false,
): Promise<{ dirHandle: FileSystemDirectoryHandle; fileName: string } | null> {
  const parts = subpath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const fileName = parts.pop()!;
  let currentDir = accountDir;

  for (const part of parts) {
    // Sanitize path component against traversal
    if (part === ".." || part === ".") continue;
    try {
      currentDir = await currentDir.getDirectoryHandle(part, { create });
    } catch {
      return null;
    }
  }

  return { dirHandle: currentDir, fileName };
}

/**
 * Writes a binary Blob to OPFS under the account directory.
 * If OPFS is unsupported, saves to IndexedDB fallback blob store.
 */
export async function opfsWriteBlob(
  accountCode: string,
  subpath: string,
  blob: Blob,
): Promise<string> {
  const accountDir = await getAccountDirectory(accountCode);

  if (accountDir) {
    try {
      const resolved = await resolvePath(accountDir, subpath, true);
      if (resolved) {
        const fileHandle = await resolved.dirHandle.getFileHandle(
          resolved.fileName,
          { create: true },
        );
        try {
          // (Safari before 26 has no createWritable: the copy goes to IndexedDB below)
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          return subpath;
        } catch (e) {
          // the empty (or half-written) file mustn't stay: reading the copy back would find it, not IndexedDB's
          await resolved.dirHandle.removeEntry(resolved.fileName).catch(() => undefined);
          throw e;
        }
      }
    } catch {
      // Fall through to IndexedDB fallback
    }
  }

  // Fallback to IndexedDB
  await dbSaveFallbackBlob({
    id: `${accountCode}:${subpath}`,
    accountCode,
    blob,
    size: blob.size,
    mimeType: blob.type || "application/octet-stream",
    updatedAt: Date.now(),
  });

  return subpath;
}

/**
 * Reads a binary Blob from OPFS under the account directory.
 * Returns null if not found.
 */
export async function opfsReadBlob(
  accountCode: string,
  subpath: string,
): Promise<Blob | null> {
  const accountDir = await getAccountDirectory(accountCode);

  if (accountDir) {
    try {
      const resolved = await resolvePath(accountDir, subpath, false);
      if (resolved) {
        const fileHandle = await resolved.dirHandle.getFileHandle(
          resolved.fileName,
        );
        const file = await fileHandle.getFile();
        // (an empty file next to a copy in IndexedDB: left by a write that failed, before that was cleaned up)
        if (file.size > 0) return file;
        const fb = await dbGetFallbackBlob(`${accountCode}:${subpath}`, accountCode).catch(() => null);
        return fb ?? file;
      }
    } catch {
      // Fall through to check fallback
    }
  }

  // Check fallback store
  return await dbGetFallbackBlob(`${accountCode}:${subpath}`, accountCode);
}

/**
 * Deletes a file from OPFS or fallback store.
 */
export async function opfsDelete(
  accountCode: string,
  subpath: string,
): Promise<boolean> {
  let deleted = false;
  const accountDir = await getAccountDirectory(accountCode);

  if (accountDir) {
    try {
      const resolved = await resolvePath(accountDir, subpath, false);
      if (resolved) {
        await resolved.dirHandle.removeEntry(resolved.fileName);
        deleted = true;
      }
    } catch {
      // Ignore
    }
  }

  const fbDeleted = await dbDeleteFallbackBlob(
    `${accountCode}:${subpath}`,
    accountCode,
  );
  return deleted || fbDeleted;
}

/**
 * Calculates storage size recursively inside an account's directory.
 */
export async function opfsGetStats(
  accountCode: string,
): Promise<{ totalBytes: number; fileCount: number }> {
  let totalBytes = 0;
  let fileCount = 0;

  const accountDir = await getAccountDirectory(accountCode);
  if (!accountDir) {
    return { totalBytes: 0, fileCount: 0 };
  }

  async function walk(dir: FileSystemDirectoryHandle): Promise<void> {
    // @ts-expect-error FileSystemDirectoryHandle.values() is async iterable in modern browsers
    for await (const entry of dir.values()) {
      if (entry.kind === "file") {
        try {
          const file = await (entry as FileSystemFileHandle).getFile();
          totalBytes += file.size;
          fileCount++;
        } catch {
          // Ignore
        }
      } else if (entry.kind === "directory") {
        await walk(entry as FileSystemDirectoryHandle);
      }
    }
  }

  try {
    await walk(accountDir);
  } catch {
    // Ignore walk error
  }

  return { totalBytes, fileCount };
}
