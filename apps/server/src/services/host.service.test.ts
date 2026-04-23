import { describe, expect, it } from "vitest";

import { decryptSecret } from "./crypto.service";
import { buildEncryptedSecretUpdate } from "./host.service";

describe("host.service", () => {
  it("ignores blank secret fields when updating a host", () => {
    expect(
      buildEncryptedSecretUpdate({
        authType: "PASSWORD",
        password: "",
        privateKey: "",
        passphrase: ""
      })
    ).toEqual({});
  });

  it("encrypts provided password updates", () => {
    const patch = buildEncryptedSecretUpdate({
      authType: "PASSWORD",
      password: "  new-secret  "
    });

    expect(decryptSecret(patch.encryptedPassword as string)).toBe("new-secret");
  });

  it("resets inactive secrets when switching auth type", () => {
    const patch = buildEncryptedSecretUpdate({
      authType: "PRIVATE_KEY",
      privateKey: "test-private-key",
      resetForAuthTypeSwitch: true
    });

    expect(patch.encryptedPassword).toBeNull();
    expect(decryptSecret(patch.encryptedPrivateKey as string)).toBe("test-private-key");
  });
});
