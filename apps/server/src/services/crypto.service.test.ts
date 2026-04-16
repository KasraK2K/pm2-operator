import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "./crypto.service";

describe("crypto.service", () => {
  it("round-trips encrypted secrets", () => {
    const encrypted = encryptSecret("super-secret-value");
    const decrypted = decryptSecret(encrypted);

    expect(encrypted).not.toBe("super-secret-value");
    expect(decrypted).toBe("super-secret-value");
  });

  it("rejects tampered payloads", () => {
    const encrypted = encryptSecret("another-value");
    const tampered = `${encrypted}extra`;

    expect(() => decryptSecret(tampered)).toThrow();
  });
});

