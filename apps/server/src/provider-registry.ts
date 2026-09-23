import { DEFAULT_OPENAI_MODEL } from "./config.js";
import OpenAI from "openai";
import {
  resolveModel,
  type AIRequest,
  type AIResponse,
  type ModelRef,
  type ModelDescriptor,
  type ProviderCatalog,
  type ProviderDescriptor,
  type Document,
} from "@workbench/domain";
import { Repository } from "./repository.js";
import { OpenAIProvider, type OpenAIClient } from "./openai-provider.js";
import { MockProvider } from "./mock-provider.js";
import { APIError } from "./errors.js";
import { validateProviderResponse } from "./provider-policy.js";

export type ProviderRegistryOptions = {
  repository: Repository;
  env?: Record<string, string | undefined>;
  client?: OpenAIClient;
};
const specs = [
  ["mock", "Offline", ""],
  ["openai", "OpenAI Direct", "OPENAI_API_KEY"],
  ["openrouter", "OpenRouter", "OPENROUTER_API_KEY"],
  ["vercel", "Vercel AI Gateway", "VERCEL_AI_GATEWAY_API_KEY"],
  ["custom", "Custom OpenAI-compatible", "CUSTOM_OPENAI_API_KEY"],
] as const;
function model(
  id: string,
  providerId: string,
  displayName = id,
  source = "discovered",
): ModelDescriptor {
  const known =
    providerId === "openai" &&
    ["gpt-4.1-mini", "gpt-4.1", "gpt-4o", "gpt-4o-mini"].includes(id);
  return {
    id,
    providerId,
    displayName,
    capabilities:
      providerId === "mock"
        ? { text: true, structuredOutput: true, webSearch: false }
        : known
          ? { text: true, structuredOutput: true, webSearch: true }
          : {},
    metadata: { source },
  };
}
/** Credentials are environment-only and never stored in SQLite or returned to callers. */
export class ProviderRegistry {
  readonly applicationDefault: ModelRef;
  private readonly repository: Repository;
  private readonly env: Record<string, string | undefined>;
  private readonly client?: OpenAIClient;
  constructor({
    repository,
    env = process.env,
    client,
  }: ProviderRegistryOptions) {
    this.repository = repository;
    this.env = env;
    const key = env.OPENAI_API_KEY?.trim();
    this.applicationDefault = key
      ? {
          providerId: "openai",
          modelId: env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
        }
      : { providerId: "mock", modelId: "conservative" };
    this.client = key
      ? (client ??
        new OpenAI({
          apiKey: key,
          timeout: 60_000,
          maxRetries: 1,
          logLevel: "off",
        }))
      : undefined;
  }
  get(id: string): ProviderDescriptor {
    const spec = specs.find((s) => s[0] === id);
    if (!spec) throw new APIError(404, "Unknown provider");
    const cached = this.repository.getProviderState(id);
    const key = this.env[spec[2]]?.trim();
    const implemented = id === "mock" || id === "openai";
    const configured = id === "mock" || Boolean(key);
    const models =
      id === "mock"
        ? [
            model("conservative", id, "Offline conservative", "built-in"),
            model("plain", id, "Offline plain", "built-in"),
          ]
        : (cached?.models ??
          (id === "openai"
            ? [
                model(
                  this.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
                  id,
                  undefined,
                  "environment default",
                ),
              ]
            : []));
    const enabled = implemented && (cached?.enabled ?? true);
    return {
      id,
      displayName: spec[1],
      implemented,
      configured,
      enabled,
      credentialSuffix: key && key.length > 4 ? key.slice(-4) : null,
      status: !implemented
        ? "Architecture/settings only: adapter not implemented; no requests are sent."
        : !configured
          ? "Not configured: set the server environment key."
          : !enabled
            ? "Disabled by user."
            : "Ready",
      lastRefreshedAt: cached?.lastRefreshedAt ?? null,
      models,
    };
  }
  catalog(): ProviderCatalog {
    return {
      providers: specs.map((s) => this.get(s[0])),
      applicationDefault: this.applicationDefault,
    };
  }
  private persist(p: ProviderDescriptor): ProviderDescriptor {
    this.repository.saveProviderState(p.id, {
      enabled: p.enabled,
      models: p.models,
      lastRefreshedAt: p.lastRefreshedAt,
    });
    return this.get(p.id);
  }
  setEnabled(id: string, enabled: boolean) {
    const p = this.get(id);
    if (enabled && !p.implemented)
      throw new APIError(400, "Provider adapter is not implemented");
    return this.persist({ ...p, enabled });
  }
  addModel(id: string, modelId: string, displayName?: string) {
    const p = this.get(id);
    if (!p.implemented || id === "mock")
      throw new APIError(
        400,
        "Manual models are supported only by OpenAI Direct",
      );
    const entry = model(
      modelId,
      id,
      displayName,
      "manual; structured output checked on response",
    );
    return this.persist({
      ...p,
      models: [...p.models.filter((m) => m.id !== modelId), entry],
    });
  }
  private available(id: string) {
    const p = this.get(id);
    if (!p.implemented)
      throw new APIError(400, "Provider adapter is not implemented");
    if (!p.enabled) throw new APIError(400, "Provider is disabled");
    if (!p.configured)
      throw new APIError(
        400,
        "Provider is not configured; set its server environment key",
      );
    return p;
  }
  async refresh(id: string) {
    const p = this.available(id);
    if (id === "mock")
      return this.persist({ ...p, lastRefreshedAt: new Date().toISOString() });
    try {
      if (!this.client?.models) throw new Error("Unavailable discovery");
      const page = await this.client.models.list();
      const rows: { id: string }[] = [];
      if (Symbol.asyncIterator in page) {
        for await (const row of page) rows.push(row);
      } else rows.push(...page.data);
      // Re-read after I/O: discovery must not undo a concurrent disable or manual addition.
      const current = this.get(id);
      const manual = current.models.filter((m) =>
        m.metadata?.source?.toString().startsWith("manual"),
      );
      const merged = new Map(rows.map((r) => [r.id, model(r.id, id)]));
      for (const m of manual) merged.set(m.id, m);
      return this.persist({
        ...current,
        models: [...merged.values()].sort((a, b) => a.id.localeCompare(b.id)),
        lastRefreshedAt: new Date().toISOString(),
      });
    } catch {
      throw new APIError(
        502,
        "Model discovery failed. Cached models were retained; check credentials and provider availability.",
      );
    }
  }
  provider(ref: ModelRef, webSearch = false) {
    const p = this.available(ref.providerId);
    const m = p.models.find((m) => m.id === ref.modelId);
    if (!m)
      throw new APIError(
        400,
        "Unknown model; refresh the catalog or add its ID manually",
      );
    if (webSearch && m.capabilities.webSearch !== true)
      throw new APIError(
        400,
        "Web search is unsupported or unverified for this model",
      );
    if (m.capabilities.structuredOutput === false)
      throw new APIError(400, "This model does not support structured output");
    return ref.providerId === "mock"
      ? new MockProvider(ref.modelId === "plain" ? "plain" : "conservative")
      : new OpenAIProvider({
          apiKey: this.env.OPENAI_API_KEY!.trim(),
          model: ref.modelId,
          client: this.client,
        });
  }
  resolve(input: AIRequest) {
    const document = input.readContext.document;
    const section = document.sections.find(
      (s) => s.id === input.editTarget.sectionId,
    );
    return resolveModel({
      oneOff: input.modelOverride,
      sectionOverride: section?.modelOverride,
      sectionType: section?.kind,
      task: input.lens || input.action === "words" ? "words" : input.action,
      documentDefault: document.defaultModel,
      preferences: this.repository.getSettings().routing,
      applicationDefault: this.applicationDefault,
    });
  }
  async run(input: AIRequest): Promise<AIResponse> {
    const { model: ref, source } = this.resolve(input);
    const provider = this.provider(ref);
    try {
      return {
        ...validateProviderResponse(
          input,
          await provider.run(input),
          ref.providerId === "mock" ? "mock" : "openai",
        ),
        model: ref,
        routeSource: source,
      };
    } catch {
      throw new APIError(
        502,
        "The provider could not produce a valid response. Your document has not been changed.",
      );
    }
  }
  async research(query: string, document?: Document, oneOff?: ModelRef | null) {
    const route = resolveModel({
      oneOff,
      task: "culture",
      documentDefault: document?.defaultModel,
      preferences: this.repository.getSettings().routing,
      applicationDefault: this.applicationDefault,
    });
    const provider = this.provider(route.model, true);
    try {
      return {
        items: await provider.researchCulture(query),
        model: route.model,
        routeSource: route.source,
      };
    } catch {
      throw new APIError(
        502,
        "Live research failed. No unverified results were saved.",
      );
    }
  }
  async test(id: string, modelId?: string) {
    try {
      const p = this.available(id);
      const selected = modelId ?? p.models[0]?.id;
      if (!selected) throw new APIError(400, "No model selected");
      const provider = this.provider({ providerId: id, modelId: selected });
      if (provider instanceof OpenAIProvider) await provider.testConnection();
      return {
        ok: true,
        message:
          id === "mock"
            ? "Offline provider ready; no network request was made."
            : "Connection succeeded. Structured output is validated on each writing response.",
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof APIError
            ? error.message
            : "Connection test failed. Check credentials, model access and provider availability.",
      };
    }
  }
}
