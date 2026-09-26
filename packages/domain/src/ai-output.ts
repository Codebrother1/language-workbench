import { z } from "zod";
import type { ModelRef } from "./routing";
const proposalSchema = z.object({
  id: z.string(),
  label: z.string(),
  text: z.string(),
  explanation: z.string(),
});
export const modelResponseSchema = z.object({
  provider: z.string(),
  diagnosis: z.string(),
  mechanism: z.string(),
  question: z.string(),
  missingIngredients: z.array(z.string()),
  proposals: z.array(proposalSchema).max(5),
  findings: z.array(
    z.object({
      sectionId: z.string().nullable(),
      title: z.string(),
      detail: z.string(),
      severity: z.enum(["note", "consider", "check"]),
    }),
  ),
  lexical: z.array(
    z.object({
      term: z.string(),
      meaning: z.string(),
      nuance: z.string(),
      register: z.string(),
      example: z.string(),
    }),
  ),
});
export const aiResponseSchema = modelResponseSchema.extend({
  proposals: z
    .array(proposalSchema.extend({ qualityNote: z.string().optional() }))
    .max(5),
  qualityNotices: z.array(z.string()).optional(),
});
export type AIResponse = z.infer<typeof aiResponseSchema> & {
  model?: ModelRef;
  routeSource?: string;
};
