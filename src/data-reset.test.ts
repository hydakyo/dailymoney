import { describe, expect, it } from "vitest";
import { hashLegacyPin, hashPin, toBase64 } from "./utils";
import { verifySettingsPin } from "./data-reset";

const baseSettings = {
  id: "settings" as const, onboardingComplete: true, openingBalance: 0, currency: "VND" as const,
  lockEnabled: true, createdAt: "", updatedAt: ""
};

describe("destructive reset PIN verification", () => {
  it("verifies both current and legacy PIN records before allowing reset", async () => {
    const salt = toBase64(new Uint8Array(16).fill(5));
    await expect(verifySettingsPin("123456", { ...baseSettings, pinSalt: salt, pinHash: await hashPin("123456", salt) })).resolves.toBe(true);
    await expect(verifySettingsPin("000000", { ...baseSettings, pinSalt: salt, pinHash: await hashPin("123456", salt) })).resolves.toBe(false);

    const legacySalt = "12345678-1234-1234-1234-123456789abc";
    await expect(verifySettingsPin("123456", { ...baseSettings, pinSalt: legacySalt, pinHash: await hashLegacyPin("123456", legacySalt) })).resolves.toBe(true);
  });
});
