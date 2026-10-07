import "server-only";
import { createHash } from "node:crypto";

type AuditEvent = {
  action: "phone_lookup";
  user: string;
  ip: string;
  outcome: "success" | "not_found" | "error" | "rate_limited" | "invalid_input";
  credits?: number;
  latencyMs?: number;
};

/**
 * Log estruturado de auditoria (LGPD: quem consultou, quando e o resultado).
 * O telefone é registrado apenas como hash — nunca o CPF ou o nome do titular.
 */
export function audit(event: AuditEvent & { phone?: string }) {
  const { phone, ...rest } = event;
  console.info(
    JSON.stringify({
      type: "audit",
      at: new Date().toISOString(),
      ...rest,
      phoneHash: phone ? createHash("sha256").update(phone).digest("hex").slice(0, 16) : undefined,
    }),
  );
}
