import { describe, expect, it } from "vitest";
import {
  deriveAccountCode,
  deriveAccountCodeSync,
  isValidAccountCode,
  normalizeEmail,
} from "@/lib/storage/account";

describe("Account Code and Identity Resolution", () => {
  it("normalizes emails properly", () => {
    expect(normalizeEmail("  Kamal@Gmail.COM  ")).toBe("kamal@gmail.com");
    expect(normalizeEmail("USER.TEST@EXAMPLE.ORG")).toBe("user.test@example.org");
  });

  it("derives a valid 12-character Crockford Base32 Account Code", async () => {
    const code = await deriveAccountCode("user-uuid-12345", "kamal@gmail.com");
    expect(code).toHaveLength(12);
    expect(isValidAccountCode(code)).toBe(true);
  });

  it("is strictly deterministic: identical inputs yield identical code across calls", async () => {
    const code1 = await deriveAccountCode("user-uuid-12345", "kamal@gmail.com");
    const code2 = await deriveAccountCode("user-uuid-12345", "kamal@gmail.com");
    const code3 = await deriveAccountCode("user-uuid-12345", "  KAMAL@gmail.com ");
    expect(code1).toBe(code2);
    expect(code1).toBe(code3);
  });

  it("produces distinct Account Codes for different user IDs", async () => {
    const codeA = await deriveAccountCode("user-a-11111", "userA@example.com");
    const codeB = await deriveAccountCode("user-b-22222", "userB@example.com");
    const codeC = await deriveAccountCode("user-c-33333", "userC@example.com");

    expect(codeA).not.toBe(codeB);
    expect(codeA).not.toBe(codeC);
    expect(codeB).not.toBe(codeC);
  });

  it("synchronous derivation also produces valid 12-char codes", () => {
    const codeSync = deriveAccountCodeSync("user-uuid-12345", "kamal@gmail.com");
    expect(codeSync).toHaveLength(12);
    expect(isValidAccountCode(codeSync)).toBe(true);
  });

  it("rejects invalid account codes", () => {
    expect(isValidAccountCode("")).toBe(false);
    expect(isValidAccountCode("SHORT")).toBe(false);
    expect(isValidAccountCode("1234567890123")).toBe(false); // 13 chars
    expect(isValidAccountCode("A7F29C41X82I")).toBe(false); // contains 'I'
    expect(isValidAccountCode("A7F29C41X82O")).toBe(false); // contains 'O'
    expect(isValidAccountCode("a7f29c41x82p")).toBe(false); // lowercase
  });
});
