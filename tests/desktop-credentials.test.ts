import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDesktopCredentialStore } from "../desktop/credentials.mjs";

const dir = mkdtempSync(join(tmpdir(), "workbench-credential-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (key: string) => Buffer.from(`sealed:${key}`),
  decryptString: (encrypted: Buffer) =>
    encrypted.toString().replace(/^sealed:/, ""),
};

describe("desktop OpenAI credential storage", () => {
  it("encrypts locally, exposes only configured/source status, and prefers saved key over legacy environment", () => {
    const store = createDesktopCredentialStore({
      dir,
      safeStorage,
      externalKey: "sk-legacy-example",
    });
    expect(store.status()).toEqual({
      configured: true,
      source: "environment",
      canStore: true,
    });
    store.save("sk-local-example");
    expect(store.status()).toEqual({
      configured: true,
      source: "desktop",
      canStore: true,
    });
    expect(store.resolveKey()).toBe("sk-local-example");
    const disk = readFileSync(join(dir, "provider-credentials.json"), "utf8");
    expect(disk).not.toContain("sk-local-example");
    expect(disk).not.toContain("sk-legacy-example");
    expect(statSync(join(dir, "provider-credentials.json")).mode & 0o777).toBe(
      0o600,
    );
    const reopened = createDesktopCredentialStore({
      dir,
      safeStorage,
      externalKey: "sk-legacy-example",
    });
    expect(reopened.resolveKey()).toBe("sk-local-example");
  });
  it("replaces atomically; encryption failures do not destroy a valid prior key", () => {
    const ownDir = mkdtempSync(join(dir, "replace-"));
    const store = createDesktopCredentialStore({ dir: ownDir, safeStorage });
    store.save("sk-first-example");
    const before = readFileSync(
      join(ownDir, "provider-credentials.json"),
      "utf8",
    );
    const blocked = createDesktopCredentialStore({
      dir: ownDir,
      safeStorage: {
        ...safeStorage,
        encryptString: () => {
          throw new Error("Keychain unavailable");
        },
      },
    });
    expect(() => blocked.save("sk-second-example")).toThrow(
      /keychain unavailable/i,
    );
    expect(
      readFileSync(join(ownDir, "provider-credentials.json"), "utf8"),
    ).toBe(before);
    store.save("sk-second-example");
    expect(store.resolveKey()).toBe("sk-second-example");
  });
  it("removes explicitly without changing legacy .env, while masking it until reconfigured", () => {
    const ownDir = mkdtempSync(join(dir, "remove-"));
    const store = createDesktopCredentialStore({
      dir: ownDir,
      safeStorage,
      externalKey: "sk-legacy-example",
    });
    store.save("sk-temporary-example");
    store.remove();
    expect(store.resolveKey()).toBeNull();
    expect(store.status()).toEqual({
      configured: false,
      source: "removed",
      canStore: true,
    });
    expect(
      readFileSync(join(ownDir, "provider-credentials.json"), "utf8"),
    ).not.toContain("sk-temporary-example");
    store.save("sk-returned-example");
    expect(store.resolveKey()).toBe("sk-returned-example");
  });
  it("does not fall back to a legacy key if saved ciphertext cannot be decrypted", () => {
    const ownDir = mkdtempSync(join(dir, "keychain-"));
    const original = createDesktopCredentialStore({ dir: ownDir, safeStorage });
    original.save("sk-previous-example");
    const locked = createDesktopCredentialStore({
      dir: ownDir,
      safeStorage: {
        ...safeStorage,
        decryptString: () => {
          throw new Error("Keychain declined");
        },
      },
      externalKey: "sk-legacy-example",
    });
    expect(locked.resolveKey()).toBeNull();
    expect(locked.status()).toEqual({
      configured: false,
      source: "unavailable",
      canStore: true,
    });
    expect(
      readFileSync(join(ownDir, "provider-credentials.json"), "utf8"),
    ).not.toContain("sk-previous-example");
  });
  it("fails closed when encrypted storage is unavailable, without persisting plaintext", () => {
    const ownDir = mkdtempSync(join(dir, "unavailable-"));
    const store = createDesktopCredentialStore({
      dir: ownDir,
      safeStorage: { ...safeStorage, isEncryptionAvailable: () => false },
    });
    expect(store.status()).toEqual({
      configured: false,
      source: "none",
      canStore: false,
    });
    expect(() => store.save("sk-no-storage-example")).toThrow(
      /secure storage is unavailable/i,
    );
  });
});
