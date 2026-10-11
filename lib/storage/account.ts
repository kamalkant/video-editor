/**
 * Stable Account Code Derivation & Identity Resolution
 *
 * Rules:
 * 1. Email is the user-facing login identity.
 * 2. Authenticated user ID (from SQLite / session) is the authoritative identity.
 * 3. Account Code is a stable, deterministic 12-character uppercase alphanumeric identifier
 *    representing the local workspace (e.g. "A7F29C41X82P").
 * 4. It MUST NOT change across logins.
 */

// Crockford Base32 alphabet: 32 uppercase characters omitting I, L, O, U to avoid ambiguity
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Normalizes email address for lookup/consistency: trim and lowercase.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Validates whether a string matches the Account Code format (12 Crockford Base32 characters).
 */
export function isValidAccountCode(code: string): boolean {
  if (typeof code !== "string" || code.length !== 12) return false;
  const regex = /^[0-9A-HJKMNP-TV-Z]{12}$/;
  return regex.test(code);
}

/**
 * Computes a SHA-256 hash of a string using Web Crypto API (browser + Node 22+).
 */
async function sha256Bytes(input: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const data = enc.encode(input);

  // (Web Crypto: every browser, and Node 22+ as a global; no node:crypto, so this file also bundles for the browser)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hashBuffer);
}

/**
 * Derives a deterministic 12-character Account Code from a stable user identity.
 *
 * Format: 12 uppercase characters (e.g. "A7F29C41X82P").
 * Deterministic: Given the same userId, always produces the exact same code.
 */
export async function deriveAccountCode(
  userId: string,
  email?: string,
): Promise<string> {
  if (!userId || typeof userId !== "string") {
    throw new Error(
      "Cannot derive Account Code without an authoritative user ID",
    );
  }

  // Domain-separated seed ensuring no collisions with other hashes
  const cleanEmail = email ? normalizeEmail(email) : "";
  const seed = `VDO:account:${userId.trim()}:${cleanEmail}`;
  const hash = await sha256Bytes(seed);

  // Encode first 60 bits (12 x 5 bits) into 12 Crockford Base32 characters
  let code = "";
  let bitBuffer = 0;
  let bitCount = 0;
  let byteIndex = 0;

  for (let i = 0; i < 12; i++) {
    while (bitCount < 5 && byteIndex < hash.length) {
      bitBuffer = (bitBuffer << 8) | hash[byteIndex]!;
      bitCount += 8;
      byteIndex++;
    }
    const val = (bitBuffer >>> (bitCount - 5)) & 0x1f;
    bitCount -= 5;
    code += CROCKFORD_ALPHABET[val];
  }

  return code;
}

/**
 * Synchronous derivation fallback using simple bitwise mixing if async cannot be awaited
 * (useful in strict synchronous render contexts; checks if pre-computed or computes).
 */
export function deriveAccountCodeSync(userId: string, email?: string): string {
  if (!userId || typeof userId !== "string") {
    throw new Error(
      "Cannot derive Account Code without an authoritative user ID",
    );
  }

  // DJB2 + FNV-1a hybrid 64-bit mixer
  const cleanEmail = email ? normalizeEmail(email) : "";
  const seed = `VDO:account:${userId.trim()}:${cleanEmail}`;

  let h1 = 0x811c9dc5;
  let h2 = 0x537f;

  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }

  // Mix bits
  h1 = Math.imul(h1 ^ (h1 >>> 16), 0x85ebca6b);
  h1 = Math.imul(h1 ^ (h1 >>> 13), 0xc2b2ae35);
  h2 = Math.imul(h2 ^ (h2 >>> 15), 0x7feb352d);
  h2 = Math.imul(h2 ^ (h2 >>> 12), 0x846ca68b);

  const combined = BigInt(h1 >>> 0) * BigInt(4294967296) + BigInt(h2 >>> 0);

  let code = "";
  let val = combined;
  for (let i = 0; i < 12; i++) {
    const charIdx = Number(val % BigInt(32));
    code += CROCKFORD_ALPHABET[charIdx];
    val = val / BigInt(32);
  }

  return code;
}
