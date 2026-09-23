import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z, ZodError } from "zod";
import {
  aiRequestSchema,
  documentSchema,
  documentText,
  settingsSchema,
  personalLibrarySchema,
  modelRefSchema,
  modelKey,
  type AIRequest,
  type LLMProvider,
} from "@workbench/domain";
import {
  validateProviderResponse,
  validateWritingRequest,
} from "./provider-policy.js";
import { ProviderRegistry } from "./provider-registry.js";
import { APIError } from "./errors.js";
import { enrichWritingRequest } from "./writing-context.js";
import type { Repository } from "./repository.js";

const createSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  text: z.string().max(500_000).optional(),
});
const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
function validHost(host: string | undefined): boolean {
  if (!host || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host))
    return false;
  try {
    return loopback.has(new URL(`http://${host}`).hostname.toLowerCase());
  } catch {
    return false;
  }
}
function validOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      loopback.has(url.hostname.toLowerCase()) &&
      url.origin === origin &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
const localOnly: RequestHandler = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!validHost(req.headers.host))
    return next(new APIError(403, "Host is not allowed"));
  const origin = req.headers.origin;
  if (origin !== undefined && !validOrigin(origin))
    return next(new APIError(403, "Origin is not allowed"));
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.headers["sec-fetch-site"] === "cross-site")
    return next(new APIError(403, "Cross-site requests are not allowed"));
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  // req.is() returns null for bodyless DELETE even when its MIME header is correct.
  // Still require a non-simple Content-Type for every mutation to retain CSRF protection.
  const mime = req.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
    mime !== "application/json"
  ) {
    return next(new APIError(415, "Mutations require application/json"));
  }
  next();
};

export type AppOptions = {
  repository: Repository;
  provider: LLMProvider;
  webDir?: string;
  registry?: ProviderRegistry;
};
/** Importing this module never listens, reads credentials, or creates a database. */
export function createApp({
  repository,
  provider,
  webDir,
  registry,
}: AppOptions) {
  const catalogRegistry =
    registry ?? new ProviderRegistry({ repository, env: {} });
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use(localOnly);
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "2mb", strict: true }));
  app.get("/api/health", (_req, res) =>
    res.json({
      ok: true,
      provider:
        registry?.applicationDefault.providerId ??
        (provider.name === "openai" ? "openai" : "mock"),
      webResearch: registry
        ? registry
            .get(registry.applicationDefault.providerId)
            .models.find((m) => m.id === registry.applicationDefault.modelId)
            ?.capabilities.webSearch === true
        : provider.capabilities.webResearch,
    }),
  );
  app.get("/api/documents", (_req, res) => res.json(repository.list()));
  app.post("/api/documents", (req, res) => {
    const input = createSchema.parse(req.body);
    res.status(201).json(repository.create(input.title, input.text));
  });
  app.get("/api/documents/:id", (req, res) =>
    res.json(repository.get(req.params.id)),
  );
  app.put("/api/documents/:id", (req, res) =>
    res.json(repository.save(req.params.id, documentSchema.parse(req.body))),
  );
  app.delete("/api/documents/:id", (req, res) => {
    repository.delete(req.params.id);
    res.status(204).end();
  });
  app.post("/api/import", (req, res) => {
    const input = z.object({ document: documentSchema }).parse(req.body);
    res.status(201).json(repository.import(input.document));
  });
  app.get("/api/library", (_req, res) => res.json(repository.getLibrary()));
  app.put("/api/library", (req, res) =>
    res.json(repository.saveLibrary(personalLibrarySchema.parse(req.body))),
  );
  app.post("/api/library/import", (req, res) => {
    const { library } = z
      .object({ library: personalLibrarySchema })
      .parse(req.body);
    res.status(201).json(repository.importLibrary(library));
  });
  app.get("/api/settings", (_req, res) => res.json(repository.getSettings()));
  app.put("/api/settings", (req, res) =>
    res.json(repository.saveSettings(settingsSchema.parse(req.body))),
  );
  app.get("/api/providers", (_req, res) => res.json(catalogRegistry.catalog()));
  app.patch("/api/providers/:id", (req, res) => {
    const { enabled } = z
      .object({ enabled: z.boolean() })
      .strict()
      .parse(req.body);
    res.json({ provider: catalogRegistry.setEnabled(req.params.id, enabled) });
  });
  app.post("/api/providers/:id/models", (req, res) => {
    const input = z
      .object({
        id: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/@+-]*$/),
        displayName: z.string().trim().min(1).max(200).optional(),
      })
      .strict()
      .parse(req.body);
    res.json({
      provider: catalogRegistry.addModel(
        req.params.id,
        input.id,
        input.displayName,
      ),
    });
  });
  app.post("/api/providers/:id/models/refresh", async (req, res) =>
    res.json({ provider: await catalogRegistry.refresh(req.params.id) }),
  );
  app.post("/api/providers/:id/test", async (req, res) => {
    const { modelId } = z
      .object({ modelId: z.string().min(1).max(200).optional() })
      .strict()
      .parse(req.body);
    res.json(await catalogRegistry.test(req.params.id, modelId));
  });
  const validateInput = (input: AIRequest) => {
    try {
      validateWritingRequest(input);
      if (
        input.editTarget.scope === "document" &&
        (input.editTarget.start !== 0 ||
          input.editTarget.end !==
            documentText(input.readContext.document).length)
      )
        throw new Error("Invalid document target range");
    } catch (error) {
      throw new APIError(
        400,
        error instanceof Error ? error.message : "Invalid edit target",
      );
    }
  };
  const run = async (input: AIRequest) => {
    if (registry) return registry.run(input);
    input = enrichWritingRequest(input, repository);
    try {
      return validateProviderResponse(
        input,
        await provider.run(input),
        provider.name === "openai" ? "openai" : "mock",
      );
    } catch (error) {
      if (error instanceof APIError) throw error;
      throw new APIError(
        502,
        "The provider could not produce a valid response. Your document has not been changed.",
      );
    }
  };
  app.post("/api/ai", async (req, res) => {
    const input = aiRequestSchema.parse(req.body);
    validateInput(input);
    res.json(await run(input));
  });
  app.post("/api/ai/compare", async (req, res) => {
    const input = z
      .object({
        request: aiRequestSchema,
        models: z.array(modelRefSchema).min(2).max(4),
      })
      .parse(req.body);
    if (new Set(input.models.map(modelKey)).size !== input.models.length)
      throw new APIError(400, "Choose 2–4 distinct models");
    validateInput(input.request);
    const results = await catalogRegistry.compare(input.request, input.models);
    res.json({ results });
  });
  app.post("/api/culture/refresh", async (req, res) => {
    const { query, documentId, modelOverride } = z
      .object({
        query: z.string().trim().min(1).max(500),
        documentId: z.string().optional(),
        modelOverride: modelRefSchema.nullable().optional(),
      })
      .parse(req.body);
    try {
      if (registry)
        res.json(
          await registry.research(
            query,
            documentId ? repository.get(documentId) : undefined,
            modelOverride,
          ),
        );
      else res.json({ items: await provider.researchCulture(query) });
    } catch (error) {
      if (error instanceof APIError) throw error;
      throw new APIError(
        502,
        "Live research failed. No unverified results were saved.",
      );
    }
  });
  app.use("/api", (_req, _res, next) =>
    next(new APIError(404, "API route not found")),
  );
  if (webDir && existsSync(resolve(webDir, "index.html"))) {
    app.use(express.static(webDir, { dotfiles: "deny", index: false }));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve(webDir, "index.html")),
    );
  }
  app.use((_req, _res, next) => next(new APIError(404, "Not found")));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: "Invalid request",
        issues: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }
    if (error instanceof APIError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error?.type === "entity.too.large") {
      res.status(413).json({ error: "Request body is too large" });
      return;
    }
    if (error?.type === "entity.parse.failed") {
      res.status(400).json({ error: "Malformed JSON" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(errorHandler);
  return app;
}
