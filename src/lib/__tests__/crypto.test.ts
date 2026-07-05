import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../crypto";

describe("crypto", () => {
  it("round-trips a secret through encryptSecret/decryptSecret", () => {
    const plain = "sk-super-secret-value-123";
    const stored = encryptSecret(plain);

    expect(stored.split(":")).toHaveLength(3);
    expect(decryptSecret(stored)).toBe(plain);
  });

  it("produces a different ciphertext (and IV) on each call", () => {
    const plain = "same-plaintext";
    const first = encryptSecret(plain);
    const second = encryptSecret(plain);

    expect(first).not.toBe(second);
    expect(decryptSecret(first)).toBe(plain);
    expect(decryptSecret(second)).toBe(plain);
  });

  it("throws when the auth tag has been tampered with", () => {
    const stored = encryptSecret("some-token");
    const [iv, ciphertext, authTag] = stored.split(":");
    const tamperedAuthTag = Buffer.from(authTag, "base64");
    tamperedAuthTag[0] ^= 0xff;
    const tampered = [iv, ciphertext, tamperedAuthTag.toString("base64")].join(":");

    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("throws when the ciphertext has been tampered with", () => {
    const stored = encryptSecret("some-token");
    const [iv, ciphertext, authTag] = stored.split(":");
    const tamperedCiphertext = Buffer.from(ciphertext, "base64");
    tamperedCiphertext[0] ^= 0xff;
    const tampered = [iv, tamperedCiphertext.toString("base64"), authTag].join(":");

    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("throws when the stored format is malformed", () => {
    expect(() => decryptSecret("not-a-valid-format")).toThrow();
  });
});
