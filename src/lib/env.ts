import "server-only";
import { z } from "zod";

const schema = z.object({
  ATLASENDER_API_KEY: z.string().min(10, "ATLASENDER_API_KEY ausente ou inválida"),
  ATLASENDER_BASE_URL: z.string().url().default("https://atlasender.com/api/cpf/v1"),
  ATLASENDER_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

/** Lê e valida as variáveis de ambiente do servidor (lazy, para não quebrar o build). */
export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      throw new Error(`Configuração inválida: ${issues.join("; ")}`);
    }
    cached = parsed.data;
  }
  return cached;
}
