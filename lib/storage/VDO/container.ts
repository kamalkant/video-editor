/**
 * Standards-compliant pure-TypeScript ZIP Container Engine for .VDO Packages
 *
 * Implements the PKZIP specification (Local headers, Central Directory, End of Central Directory)
 * with strict security guarantees:
 * - Prevents Zip-Slip path traversal (blocks `..`, `/`, `\`, null bytes, absolute paths)
 * - Computes and verifies CRC32 checksums
 * - Supports arbitrary binary files and UTF-8 filenames
 */

// CRC-32 Table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export type ZipEntry = {
  path: string;
  data: Uint8Array;
  lastModified?: Date;
};

/**
 * Validates and sanitizes a path inside a ZIP archive.
 * Throws an Error if the path attempts directory traversal.
 */
export function sanitizeArchivePath(rawPath: string): string {
  // Normalize slashes
  let p = rawPath.replace(/\\/g, "/");

  // Reject null bytes
  if (p.includes("\0")) {
    throw new Error(`Insecure archive path: contains null byte "${rawPath}"`);
  }

  // Remove leading slash
  if (p.startsWith("/")) {
    p = p.replace(/^\/+/, "");
  }

  // Split into components and check each
  const parts = p.split("/");
  const safeParts: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      throw new Error(`Insecure archive path: directory traversal attempt "${rawPath}"`);
    }
    safeParts.push(part);
  }

  if (safeParts.length === 0) {
    throw new Error(`Insecure archive path: empty path "${rawPath}"`);
  }

  return safeParts.join("/");
}

/**
 * Encodes DOS date and time for ZIP headers
 */
function toDosTime(date: Date): { time: number; date: number } {
  const d = date || new Date();
  const time =
    ((d.getHours() & 0x1f) << 11) |
    ((d.getMinutes() & 0x3f) << 5) |
    ((Math.floor(d.getSeconds() / 2)) & 0x1f);
  const dt =
    (((d.getFullYear() - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0x0f) << 5) |
    (d.getDate() & 0x1f);
  return { time, date: dt };
}

/**
 * Builds a valid ZIP archive from a list of files.
 */
export async function createZipArchive(entries: ZipEntry[]): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const fileRecords: {
    path: string;
    pathBytes: Uint8Array;
    data: Uint8Array;
    crc: number;
    dosTime: { time: number; date: number };
    localHeaderOffset: number;
  }[] = [];

  let currentOffset = 0;
  const localParts: Uint8Array[] = [];

  for (const entry of entries) {
    const safePath = sanitizeArchivePath(entry.path);
    const pathBytes = enc.encode(safePath);
    const data = entry.data;
    const crc = crc32(data);
    const dosTime = toDosTime(entry.lastModified || new Date());

    const header = new Uint8Array(30 + pathBytes.length);
    const view = new DataView(header.buffer);

    // Local file header signature (0x04034b50)
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true); // version needed to extract
    view.setUint16(6, 0x0800, true); // bit flag (UTF-8 enabled)
    view.setUint16(8, 0, true); // compression method (0 = stored)
    view.setUint16(10, dosTime.time, true);
    view.setUint16(12, dosTime.date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true); // compressed size
    view.setUint32(22, data.length, true); // uncompressed size
    view.setUint16(26, pathBytes.length, true);
    view.setUint16(28, 0, true); // extra field length
    header.set(pathBytes, 30);

    fileRecords.push({
      path: safePath,
      pathBytes,
      data,
      crc,
      dosTime,
      localHeaderOffset: currentOffset,
    });

    localParts.push(header);
    localParts.push(data);
    currentOffset += header.length + data.length;
  }

  // Central Directory
  const centralDirOffset = currentOffset;
  const centralParts: Uint8Array[] = [];

  for (const rec of fileRecords) {
    const header = new Uint8Array(46 + rec.pathBytes.length);
    const view = new DataView(header.buffer);

    // Central file header signature (0x02014b50)
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true); // version made by
    view.setUint16(6, 20, true); // version needed to extract
    view.setUint16(8, 0x0800, true); // bit flag (UTF-8)
    view.setUint16(10, 0, true); // compression method (stored)
    view.setUint16(12, rec.dosTime.time, true);
    view.setUint16(14, rec.dosTime.date, true);
    view.setUint32(16, rec.crc, true);
    view.setUint32(20, rec.data.length, true); // compressed size
    view.setUint32(24, rec.data.length, true); // uncompressed size
    view.setUint16(28, rec.pathBytes.length, true);
    view.setUint16(30, 0, true); // extra field length
    view.setUint16(32, 0, true); // comment length
    view.setUint16(34, 0, true); // disk number start
    view.setUint16(36, 0, true); // internal attributes
    view.setUint32(38, 0, true); // external attributes
    view.setUint32(42, rec.localHeaderOffset, true);
    header.set(rec.pathBytes, 46);

    centralParts.push(header);
    currentOffset += header.length;
  }

  const centralDirSize = currentOffset - centralDirOffset;

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
  eocdView.setUint16(4, 0, true); // disk number
  eocdView.setUint16(6, 0, true); // disk with central dir
  eocdView.setUint16(8, fileRecords.length, true); // entries on disk
  eocdView.setUint16(10, fileRecords.length, true); // total entries
  eocdView.setUint32(12, centralDirSize, true); // size of central dir
  eocdView.setUint32(16, centralDirOffset, true); // offset of central dir
  eocdView.setUint16(20, 0, true); // comment length

  // Combine all parts into single Uint8Array
  const totalLength = currentOffset + eocd.length;
  const output = new Uint8Array(totalLength);
  let pos = 0;

  for (const part of [...localParts, ...centralParts, eocd]) {
    output.set(part, pos);
    pos += part.length;
  }

  return output;
}

/**
 * Extracts and parses a ZIP archive buffer into safe ZipEntry files.
 * Throws on corruption or Zip-Slip attempts.
 */
export async function readZipArchive(archiveInput: Uint8Array | ArrayBuffer): Promise<ZipEntry[]> {
  const archiveBytes = archiveInput instanceof ArrayBuffer ? new Uint8Array(archiveInput) : archiveInput;
  const dec = new TextDecoder();
  const view = new DataView(archiveBytes.buffer, archiveBytes.byteOffset, archiveBytes.byteLength);

  // 1. Find End of Central Directory (EOCD) signature (0x06054b50) scanning backwards from the end
  let eocdOffset = -1;
  const maxSearch = Math.min(archiveBytes.byteLength, 65557); // 65535 max comment + 22 EOCD
  for (let i = archiveBytes.byteLength - 22; i >= archiveBytes.byteLength - maxSearch; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error("Invalid archive: End of Central Directory signature not found");
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirSize = view.getUint32(eocdOffset + 12, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  if (centralDirOffset + centralDirSize > eocdOffset) {
    throw new Error("Corrupted archive: Central Directory bounds exceed archive size");
  }

  const entries: ZipEntry[] = [];
  let cdPtr = centralDirOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (cdPtr + 46 > archiveBytes.byteLength) {
      throw new Error("Corrupted archive: Unexpected EOF reading Central Directory header");
    }

    const sig = view.getUint32(cdPtr, true);
    if (sig !== 0x02014b50) {
      throw new Error(`Corrupted archive: Invalid Central Directory header signature at offset ${cdPtr}`);
    }

    const compression = view.getUint16(cdPtr + 10, true);
    const expectedCrc = view.getUint32(cdPtr + 16, true);
    const compressedSize = view.getUint32(cdPtr + 20, true);
    const uncompressedSize = view.getUint32(cdPtr + 24, true);
    const fileNameLen = view.getUint16(cdPtr + 28, true);
    const extraFieldLen = view.getUint16(cdPtr + 30, true);
    const commentLen = view.getUint16(cdPtr + 32, true);
    const localHeaderOffset = view.getUint32(cdPtr + 42, true);

    const rawPathBytes = archiveBytes.subarray(cdPtr + 46, cdPtr + 46 + fileNameLen);
    const rawPath = dec.decode(rawPathBytes);
    cdPtr += 46 + fileNameLen + extraFieldLen + commentLen;

    // Skip directory entries ending with slash
    if (rawPath.endsWith("/")) continue;

    const safePath = sanitizeArchivePath(rawPath);

    // Read from local file header
    if (localHeaderOffset + 30 > archiveBytes.byteLength) {
      throw new Error(`Corrupted archive: Invalid local header offset for ${safePath}`);
    }

    const localSig = view.getUint32(localHeaderOffset, true);
    if (localSig !== 0x04034b50) {
      throw new Error(`Corrupted archive: Invalid local header signature for ${safePath}`);
    }

    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;

    if (dataOffset + compressedSize > archiveBytes.byteLength) {
      throw new Error(`Corrupted archive: Data range out of bounds for ${safePath}`);
    }

    const rawData = archiveBytes.subarray(dataOffset, dataOffset + compressedSize);
    let decompressed: Uint8Array;

    if (compression === 0) {
      // Stored (uncompressed)
      decompressed = new Uint8Array(rawData);
    } else if (compression === 8) {
      // Deflate decompression via standard DecompressionStream if available
      if (typeof DecompressionStream !== "undefined") {
        try {
          const ds = new DecompressionStream("deflate-raw");
          const writer = ds.writable.getWriter();
          void writer.write(new Uint8Array(rawData) as unknown as BufferSource);
          void writer.close();
          const reader = ds.readable.getReader();
          const chunks: Uint8Array[] = [];
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
          }
          const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
          decompressed = new Uint8Array(totalLen);
          let offset = 0;
          for (const c of chunks) {
            decompressed.set(c, offset);
            offset += c.length;
          }
        } catch (e) {
          throw new Error(`Failed decompressing deflate stream for ${safePath}: ${(e as Error).message}`);
        }
      } else {
        throw new Error(`Unsupported compression method ${compression} without DecompressionStream support`);
      }
    } else {
      throw new Error(`Unsupported compression method ${compression} for ${safePath}`);
    }

    // Verify CRC-32
    const actualCrc = crc32(decompressed);
    if (actualCrc !== expectedCrc) {
      throw new Error(`CRC-32 mismatch for ${safePath}: expected ${expectedCrc}, got ${actualCrc}`);
    }

    entries.push({
      path: safePath,
      data: decompressed,
    });
  }

  return entries;
}
