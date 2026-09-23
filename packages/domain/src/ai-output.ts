import { z } from "zod";
import type { ModelRef } from "./routing";
export const aiResponseSchema = z.object({
  provider: z.string(),
  diagnosis: z.string(),
  mechanism: z.string(),
  question: z.string(),
  missingIngredients: z.array(z.string()),
  proposals: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        text: z.string(),
        explanation: z.string(),
      }),
    )
    .max(5),
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
export type AIResponse = z.infer<typeof aiResponseSchema> & {
  model?: ModelRef;
  routeSource?: string;
};
