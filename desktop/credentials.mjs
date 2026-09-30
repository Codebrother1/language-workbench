import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

export function createDesktopCredentialStore({
  dir,
  safeStorage,
  externalKey = null,
}) {
  const path = join(dir, "provider-credentials.json");
  let failedDecryption = false;
  const record = () => {
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (
      parsed?.version !== 1 ||
      (parsed.disabled !== true &&
        (typeof parsed.ciphertext !== "string" || !parsed.ciphertext))
    )
      throw new Error(
        "Stored desktop credential could not be read. Your writing database was not changed.",
      );
    return parsed;
  };
  const persist = (value) => {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(value), {
        flag: "wx",
        mode: 0o600,
      });
      renameSync(temporary, path);
    } catch {
      if (existsSync(temporary)) unlinkSync(temporary);
      throw new Error(
        "Could not save the local credential. The previous key was retained.",
      );
    }
  };
  return {
    status() {
      const saved = record();
      const available = safeStorage.isEncryptionAvailable();
      const source = saved?.disabled
        ? "removed"
        : saved
          ? failedDecryption || !available
            ? "unavailable"
            : "desktop"
          : externalKey
            ? "environment"
            : "none";
      return {
        configured: source === "desktop" || source === "environment",
        source,
        canStore: available,
      };
    },
    resolveKey() {
      const saved = record();
      if (saved?.disabled) return null;
      if (!saved) return externalKey?.trim() || null;
      if (!safeStorage.isEncryptionAvailable()) {
        failedDecryption = true;
        return null;
      }
      try {
        return safeStorage.decryptString(
          Buffer.from(saved.ciphertext, "base64"),
        );
      } catch {
        failedDecryption = true;
        return null;
      }
    },
    save(value) {
      if (
        typeof value !== "string" ||
        value.trim().length < 8 ||
        value.trim().length > 512
      )
        throw new Error("Enter an API key between 8 and 512 characters.");
      if (!safeStorage.isEncryptionAvailable())
        throw new Error(
          "Secure storage is unavailable; the key was not saved.",
        );
      const encrypted = safeStorage.encryptString(value.trim());
      persist({ version: 1, ciphertext: encrypted.toString("base64") });
      failedDecryption = false;
      return this.status();
    },
    remove() {
      persist({ version: 1, disabled: true });
      failedDecryption = false;
      return this.status();
    },
  };
}
