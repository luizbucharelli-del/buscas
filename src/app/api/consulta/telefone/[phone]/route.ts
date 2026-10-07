import { NextResponse, type NextRequest } from "next/server";
import { AtlasenderError, lookupByPhone, type AtlasenderErrorCode } from "@/lib/atlasender";
import { audit } from "@/lib/audit";
import { serverEnv } from "@/lib/env";
import { normalizePhone } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ERROR_MAP: Record<AtlasenderErrorCode, { status: number; message: string }> = {
  NOT_FOUND: { status: 404, message: "Nenhum titular encontrado para este telefone." },
  UNAUTHORIZED: { status: 502, message: "Chave da API recusada pelo provedor." },
  NO_CREDITS: { status: 402, message: "Créditos insuficientes na conta Atlasender." },
  RATE_LIMITED: { status: 429, message: "Limite do provedor atingido. Tente novamente em instantes." },
  TIMEOUT: { status: 504, message: "O provedor demorou para responder." },
  INVALID_RESPONSE: { status: 502, message: "Resposta inesperada do provedor." },
  UPSTREAM_ERROR: { status: 502, message: "Falha ao consultar o provedor." },
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  const { phone: raw } = await params;
  const user = req.headers.get("x-app-user") ?? "unknown";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const noStore = { "Cache-Control": "no-store" };

  const env = serverEnv();
  const limit = rateLimit(`lookup:${ip}`, env.RATE_LIMIT_PER_MINUTE);
  if (!limit.ok) {
    audit({ action: "phone_lookup", user, ip, outcome: "rate_limited" });
    return NextResponse.json(
      { error: "Muitas consultas. Aguarde um minuto." },
      { status: 429, headers: { ...noStore, "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } },
    );
  }

  const phone = normalizePhone(raw);
  if (!phone) {
    audit({ action: "phone_lookup", user, ip, outcome: "invalid_input" });
    return NextResponse.json({ error: "Telefone inválido. Use DDD + número." }, { status: 400, headers: noStore });
  }

  try {
    const data = await lookupByPhone(phone);
    audit({
      action: "phone_lookup",
      user,
      ip,
      phone,
      outcome: "success",
      credits: data.meta?.creditsDebited,
      latencyMs: data.meta?.latencyMs,
    });
    return NextResponse.json(
      {
        telefone: data.telefone,
        titular: data.titular,
        cpf: data.cpf,
        operadora: data.operadora ?? null,
        tipo: data.tipo ?? null,
        meta: data.meta ?? null,
      },
      { headers: noStore },
    );
  } catch (err) {
    const code: AtlasenderErrorCode = err instanceof AtlasenderError ? err.code : "UPSTREAM_ERROR";
    audit({ action: "phone_lookup", user, ip, phone, outcome: code === "NOT_FOUND" ? "not_found" : "error" });
    if (!(err instanceof AtlasenderError)) console.error("phone_lookup failed", err);
    const { status, message } = ERROR_MAP[code];
    return NextResponse.json({ error: message, code }, { status, headers: noStore });
  }
}
