import "server-only";
import { serverEnv } from "@/lib/env";
import { AtlasenderError, codeFromStatus } from "./errors";
import { phoneLookupSchema, type PhoneLookupResult } from "./types";

/**
 * Consulta titular/CPF a partir de um telefone.
 * GET {base}/phone/:phone  —  header X-API-Key
 * `phone` deve estar normalizado (ver normalizePhone).
 */
export async function lookupByPhone(phone: string): Promise<PhoneLookupResult> {
  const env = serverEnv();
  const url = `${env.ATLASENDER_BASE_URL}/phone/${encodeURIComponent(phone)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { "X-API-Key": env.ATLASENDER_API_KEY, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(env.ATLASENDER_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new AtlasenderError("TIMEOUT");
    }
    throw new AtlasenderError("UPSTREAM_ERROR");
  }

  if (!res.ok) throw new AtlasenderError(codeFromStatus(res.status), res.status);

  const parsed = phoneLookupSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new AtlasenderError("INVALID_RESPONSE", res.status);
  return parsed.data;
}
