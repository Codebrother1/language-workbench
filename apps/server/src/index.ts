import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createRepository } from "./repository.js";
import { MockProvider } from "./mock-provider.js";
import { ProviderRegistry } from "./provider-registry.js";
export { createApp } from "./app.js";
export { createRepository, Repository } from "./repository.js";
export { MockProvider } from "./mock-provider.js";
export { OpenAIProvider } from "./openai-provider.js";
export { ProviderRegistry } from "./provider-registry.js";

export function startServer() {
  const config = loadConfig();
  const repository = createRepository(config.dataDir);
  const registry = new ProviderRegistry({ repository });
  const provider = new MockProvider();
  const app = createApp({
    repository,
    provider,
    registry,
    webDir: config.webDir,
  });
  const server = app.listen(config.port, "127.0.0.1", () =>
    console.info(
      `Language Workbench: http://127.0.0.1:${config.port} (${registry.applicationDefault.providerId})`,
    ),
  );
  const shutdown = () =>
    server.close(() => {
      repository.close();
      process.exit(0);
    });
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  server.on("error", () => {
    console.error(
      "Could not start the local server. Check the port and data directory.",
    );
    repository.close();
    process.exitCode = 1;
  });
  return { app, server, repository };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    startServer();
  } catch {
    console.error(
      "Could not start the local server. Check the configuration and data directory.",
    );
    process.exitCode = 1;
  }
}
