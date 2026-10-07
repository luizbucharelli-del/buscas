import { z } from "zod";

export const phoneLookupSchema = z.object({
  status: z.number(),
  telefone: z.string(),
  titular: z.string(),
  cpf: z.string(),
  operadora: z.string().nullable().optional(),
  tipo: z.string().nullable().optional(),
  meta: z
    .object({
      creditsDebited: z.number(),
      latencyMs: z.number(),
    })
    .optional(),
});

export type PhoneLookupResult = z.infer<typeof phoneLookupSchema>;
