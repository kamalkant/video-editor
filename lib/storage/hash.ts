/**
 * SHA-256 Content Fingerprinting for Asset Deduplication
 */

export async function calculateBlobHash(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(digest));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Node environment fallback
  try {
    const nodeCrypto = await import("node:crypto");
    return nodeCrypto.createHash("sha256").update(Buffer.from(buffer)).digest("hex");
  } catch {
    // Basic fallback hash if crypto unavailable
    let hash = 0;
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) {
      hash = (hash << 5) - hash + bytes[i]!;
      hash |= 0;
    }
    return `fb_${Math.abs(hash).toString(16)}_${blob.size}`;
  }
}
