import { describe, expect, it } from "vitest";
import { hashLegacyPin, hashPin, timingSafeEqual, toBase64 } from "./utils";

describe("PIN hashing", () => {
  it("keeps legacy PIN verification exact during migration", async () => {
    const salt = "12345678-1234-1234-1234-123456789abc";
    const expected = await hashLegacyPin("123456", salt);
    expect(timingSafeEqual(await hashLegacyPin("123456", salt), expected)).toBe(true);
    expect(timingSafeEqual(await hashLegacyPin("000000", salt), expected)).toBe(false);
  });

  it("derives a stable current PIN hash", async () => {
    const salt = toBase64(new Uint8Array(16).fill(7));
    const expected = await hashPin("123456", salt);
    expect(timingSafeEqual(await hashPin("123456", salt), expected)).toBe(true);
    expect(timingSafeEqual(await hashPin("654321", salt), expected)).toBe(false);
  });
});
