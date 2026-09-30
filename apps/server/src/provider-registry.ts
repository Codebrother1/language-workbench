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
import { enrichWritingRequest } from "./writing-context.js";

export type ProviderRegistryOptions = {
  repository: Repository;
  env?: Record<string, string | undefined>;
  client?: OpenAIClient;
  clientFactory?: (key: string) => OpenAIClient;
};
const specs = [
  ["mock", "Offline", ""],
  ["openai", "OpenAI Direct", "OPENAI_API_KEY"],
  ["openrouter", "OpenRouter", "OPENROUTER_API_KEY"],
  ["vercel", "Vercel AI Gateway", "VERCEL_AI_GATEWAY_API_KEY"],
  ["custom", "Custom OpenAI-compatible", "CUSTOM_OPENAI_API_KEY"],
] as const;
const curatedOpenAI: Record<string, string> = {
  "gpt-4.1-mini": "GPT-4.1 mini",
  "gpt-4.1": "GPT-4.1",
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o mini",
  "gpt-6-luna": "GPT-6 Luna",
  "gpt-6-sol": "GPT-6 Sol",
  "gpt-6-astra": "GPT-6 Astra",
};
export function classifyOpenAIModel(
  id: string,
): "known" | "other" | "excluded" {
  if (!/^[a-z0-9][a-z0-9.:-]{0,199}$/.test(id)) return "excluded";
  if (
    /^(?:chatgpt|ft:|dall-e|sora|whisper|tts|text-embedding|omni-moderation|text-moderation)/.test(
      id,
    ) ||
    /(?:image|realtime|audio|speech|transcrib|tts|embed|moderat|video|vision|chatgpt|codex|computer-use|search|safety|instruct|preview)/.test(
      id,
    ) ||
    /-\d{4}-(?:0[1-9]|1[0-2])-(?:[0-2]\d|3[01])$/.test(id) ||
    /-20\d{6}$/.test(id) ||
    /^gpt-(?:[4-9]|[1-9]\d)(?:\.\d+)?-(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/.test(
      id,
    ) ||
    /-chat-latest$/.test(id)
  )
    return "excluded";
  if (id in curatedOpenAI) return "known";
  return /^gpt-(?:[4-9]|[1-9]\d)(?:\.\d+)?(?:-[a-z0-9]+)*$/.test(id)
    ? "other"
    : "excluded";
}
function model(
  id: string,
  providerId: string,
  displayName = id,
  source = "discovered",
): ModelDescriptor {
  const known = providerId === "openai" && id in curatedOpenAI;
  return {
    id,
    providerId,
    displayName: known && displayName === id ? curatedOpenAI[id] : displayName,
    capabilities:
      providerId === "mock"
        ? { text: true, structuredOutput: true, webSearch: false }
        : known
          ? {
              text: true,
              structuredOutput: true,
              ...(id.startsWith("gpt-4") ? { webSearch: true } : {}),
            }
          : {},
    availability: providerId === "mock" ? "available" : "unverified",
    metadata: {
      source,
      ...(providerId === "openai" ? { group: known ? "known" : "other" } : {}),
    },
  };
}
/** Credentials are environment-only and never stored in SQLite or returned to callers. */
export class ProviderRegistry {
  readonly applicationDefault: ModelRef;
  private readonly repository: Repository;
  private readonly env: Record<string, string | undefined>;
  private client?: OpenAIClient;
  private readonly clientFactory: (key: string) => OpenAIClient;
  constructor({
    repository,
    env = process.env,
    client,
    clientFactory,
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
    this.clientFactory =
      clientFactory ??
      ((apiKey) =>
        new OpenAI({
          apiKey,
          timeout: 60_000,
          maxRetries: 1,
          logLevel: "off",
        }));
    this.client = key ? (client ?? this.clientFactory(key)) : undefined;
  }
  setOpenAICredential(key: string | null): ProviderDescriptor {
    const trimmed = key?.trim();
    const next = trimmed ? this.clientFactory(trimmed) : undefined;
    if (trimmed) this.env.OPENAI_API_KEY = trimmed;
    else delete this.env.OPENAI_API_KEY;
    this.client = next;
    return this.get("openai");
  }
  get(id: string): ProviderDescriptor {
    const spec = specs.find((s) => s[0] === id);
    if (!spec) throw new APIError(404, "Unknown provider");
    const cached = this.repository.getProviderState(id);
    const key = this.env[spec[2]]?.trim();
    const implemented = id === "mock" || id === "openai";
    const configured = id === "mock" || Boolean(key);
    const models: ModelDescriptor[] =
      id === "mock"
        ? [
            model("conservative", id, "Offline conservative", "built-in"),
            model("plain", id, "Offline plain", "built-in"),
          ]
        : cached?.models?.length
          ? cached.models.map((entry) => {
              const classification =
                id === "openai" ? classifyOpenAIModel(entry.id) : "excluded";
              return {
                ...entry,
                displayName:
                  classification === "known" &&
                  entry.metadata?.source === "discovered"
                    ? curatedOpenAI[entry.id]
                    : entry.displayName,
                availability:
                  classification === "excluded" &&
                  id === "openai" &&
                  cached.lastRefreshedAt
                    ? ("unavailable" as const)
                    : (entry.availability ??
                      (cached.lastRefreshedAt &&
                      entry.metadata?.source === "discovered" &&
                      classification !== "excluded"
                        ? ("available" as const)
                        : ("unverified" as const))),
                metadata: {
                  ...entry.metadata,
                  group: classification === "known" ? "known" : "other",
                },
              };
            })
          : id === "openai"
            ? Object.keys(curatedOpenAI).map((name) =>
                model(name, id, name, "built-in"),
              )
            : [];
    if (id === "openai") {
      if (!cached?.lastRefreshedAt)
        for (const knownId of Object.keys(curatedOpenAI))
          if (!models.some((entry) => entry.id === knownId))
            models.push(model(knownId, id, knownId, "built-in"));
      const defaultId = this.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
      if (!models.some((entry) => entry.id === defaultId))
        models.unshift({
          ...model(defaultId, id, defaultId, "environment default"),
          availability: cached?.lastRefreshedAt ? "unavailable" : "unverified",
        });
    }
    const enabled = implemented && (cached?.enabled ?? true);
    return {
      id,
      displayName: spec[1],
      implemented,
      configured,
      enabled,
      credentialSuffix: this.env.WORKBENCH_DESKTOP
        ? null
        : key && key.length > 4
          ? key.slice(-4)
          : null,
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
    const entry = {
      ...model(
        modelId,
        id,
        displayName,
        "manual; structured output checked on response",
      ),
      availability:
        p.models.find((m) => m.id === modelId)?.availability ??
        (p.lastRefreshedAt ? "unavailable" : "unverified"),
    };
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
      const rows: unknown[] = [];
      if (Symbol.asyncIterator in page) {
        for await (const row of page) {
          rows.push(row);
          if (rows.length > 5000) throw new Error("Model list too large");
        }
      } else if (Array.isArray(page.data)) rows.push(...page.data);
      else throw new Error("Invalid model list");
      if (
        !rows.length ||
        rows.length > 5000 ||
        rows.some(
          (row) =>
            !row ||
            typeof row !== "object" ||
            typeof (row as { id?: unknown }).id !== "string",
        )
      )
        throw new Error("Invalid model list");
      const compatible = rows
        .map((row) => (row as { id: string }).id)
        .filter((modelId) => classifyOpenAIModel(modelId) !== "excluded");
      if (!compatible.length) throw new Error("No compatible models");
      // Re-read after I/O: discovery must not undo a concurrent disable or manual addition.
      const current = this.get(id);
      const merged = new Map<string, ModelDescriptor>(
        compatible.map((modelId) => [
          modelId,
          { ...model(modelId, id), availability: "available" },
        ]),
      );
      for (const entry of current.models)
        if (
          !merged.has(entry.id) &&
          (classifyOpenAIModel(entry.id) === "known" ||
            entry.metadata?.source?.toString().startsWith("manual"))
        )
          merged.set(entry.id, { ...entry, availability: "unavailable" });
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
        p.id === "openai" && p.lastRefreshedAt
          ? "This model is not currently available to this OpenAI project. Choose another model or refresh the catalog."
          : "Unknown model; refresh the catalog or add its ID manually",
      );
    if (
      ref.providerId === "openai" &&
      p.lastRefreshedAt &&
      m.availability !== "available"
    )
      throw new APIError(
        400,
        "This model is not currently available to this OpenAI project. Choose another model or refresh the catalog.",
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
    return this.runEnriched(enrichWritingRequest(input, this.repository));
  }
  /** Capture one library/style snapshot so every comparison model sees identical context. */
  async compare(input: AIRequest, models: ModelRef[]) {
    const enriched = enrichWritingRequest(input, this.repository);
    return Promise.all(
      models.map(async (model) => {
        try {
          return {
            model,
            response: await this.runEnriched({
              ...structuredClone(enriched),
              modelOverride: model,
            }),
          };
        } catch (error) {
          return {
            model,
            error:
              error instanceof APIError
                ? error.message
                : "Provider request failed; no document changes were made.",
          };
        }
      }),
    );
  }
  private async runEnriched(input: AIRequest): Promise<AIResponse> {
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
            : [401, 403].includes((error as { status?: number })?.status ?? 0)
              ? "OpenAI authentication or project access failed. Check this API key and project."
              : "Provider connection failed. Check network, model access and provider availability.",
      };
    }
  }
}
