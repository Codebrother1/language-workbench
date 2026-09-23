import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import dotenv from "dotenv";

// src/ and dist/ are siblings: this works under tsx, tsup, and any process cwd.
export const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
export function loadConfig() {
  dotenv.config({
    path: resolve(repoRoot, ".env"),
    quiet: true,
  } as dotenv.DotenvConfigOptions);
  const port = Number(process.env.PORT || 4318);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  return {
    port,
    dataDir: resolve(repoRoot, process.env.DATA_DIR || "data"),
    webDir: resolve(repoRoot, "apps/web/dist"),
    apiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
  };
}
