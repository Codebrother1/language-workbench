import { z } from "zod";
export const modelRefSchema = z.object({
  providerId: z.string().min(1).max(80),
  modelId: z.string().min(1).max(200),
});
export type ModelRef = z.infer<typeof modelRefSchema>;
export const modelCapabilitiesSchema = z.object({
  text: z.boolean().optional(),
  structuredOutput: z.boolean().optional(),
  streaming: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  tools: z.boolean().optional(),
  webSearch: z.boolean().optional(),
  vision: z.boolean().optional(),
});
export const modelDescriptorSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  displayName: z.string(),
  capabilities: modelCapabilitiesSchema.default({}),
  metadata: z.record(z.unknown()).optional(),
});
export type ModelDescriptor = z.infer<typeof modelDescriptorSchema>;
export const routingPreferencesSchema = z.object({
  applicationDefault: modelRefSchema.nullable().default(null),
  sectionTypeDefaults: z.record(modelRefSchema).default({}),
  taskDefaults: z.record(modelRefSchema).default({}),
});
export type RoutingPreferences = z.infer<typeof routingPreferencesSchema>;
export type RouteSource =
  "action" | "section" | "section_type" | "task" | "document" | "application";
export type ResolvedModel = { model: ModelRef; source: RouteSource };
/** The sole resolution algorithm. Context does not grant edit or model fallback authority. */
export function resolveModel(input: {
  oneOff?: ModelRef | null;
  sectionOverride?: ModelRef | null;
  sectionType?: string;
  task: string;
  documentDefault?: ModelRef | null;
  preferences?: RoutingPreferences;
  applicationDefault: ModelRef;
}): ResolvedModel {
  const p = input.preferences;
  const candidates: [RouteSource, ModelRef | null | undefined][] = [
    ["action", input.oneOff],
    ["section", input.sectionOverride],
    [
      "section_type",
      input.sectionType ? p?.sectionTypeDefaults[input.sectionType] : undefined,
    ],
    ["task", p?.taskDefaults[input.task]],
    ["document", input.documentDefault],
    ["application", p?.applicationDefault ?? input.applicationDefault],
  ];
  const [source, model] = candidates.find(([, ref]) => Boolean(ref))!;
  return { model: model!, source };
}
export const providerDescriptorSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  implemented: z.boolean(),
  configured: z.boolean(),
  enabled: z.boolean(),
  credentialSuffix: z.string().nullable(),
  status: z.string(),
  lastRefreshedAt: z.string().nullable(),
  models: z.array(modelDescriptorSchema),
});
export type ProviderDescriptor = z.infer<typeof providerDescriptorSchema>;
export const providerCatalogSchema = z.object({
  providers: z.array(providerDescriptorSchema),
  applicationDefault: modelRefSchema,
});
export type ProviderCatalog = z.infer<typeof providerCatalogSchema>;
export const lensOptionsSchema = z.object({
  mode: z.enum(["explore", "replace"]).default("explore"),
  fidelity: z.enum(["exact", "balanced", "loose"]).default("balanced"),
  shape: z.enum(["word", "phrase", "expression"]).default("word"),
  intent: z.string().default("Custom"),
  persona: z.string().default(""),
  technical: z.boolean().default(false),
});
export type LensOptions = z.infer<typeof lensOptionsSchema>;
export const quickWordIntents = [
  "Clearer",
  "Shorter",
  "More precise",
  "More formal",
  "Conversational",
  "Technical",
  "Literary",
  "Funnier",
  "Stronger",
  "Softer",
  "Less cliché",
  "Period-flavored",
  "Custom",
] as const;
export function modelKey(ref: ModelRef): string {
  return JSON.stringify([ref.providerId, ref.modelId]);
}
export function parseModelKey(value: string): ModelRef | null {
  if (!value) return null;
  const [providerId, modelId] = JSON.parse(value);
  return modelRefSchema.parse({ providerId, modelId });
}
