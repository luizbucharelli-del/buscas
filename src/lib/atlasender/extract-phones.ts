import { normalizePhone } from "../phone";

export type ExtractedPhone = { numero: string; operadora?: string; tipo?: string };

const PHONE_KEY = /tel|cel|fone|phone|whats|contato|m[oó]vel|fixo/i;

/**
 * Extrai telefones de uma resposta cujo formato exato não é garantido.
 * Percorre o JSON e coleta números de campos com nome de telefone, aceitando:
 * strings/números, listas, e objetos como { ddd, numero, operadora, tipo }.
 */
export function extractPhones(payload: unknown): ExtractedPhone[] {
  const found = new Map<string, ExtractedPhone>();

  const add = (raw: unknown, extra: Partial<ExtractedPhone> = {}) => {
    if (typeof raw !== "string" && typeof raw !== "number") return;
    const numero = normalizePhone(String(raw));
    if (numero && !found.has(numero)) found.set(numero, { numero, ...extra });
  };

  const fromObject = (obj: Record<string, unknown>) => {
    const str = (k: RegExp) => {
      const key = Object.keys(obj).find((x) => k.test(x));
      const v = key ? obj[key] : undefined;
      return typeof v === "string" || typeof v === "number" ? String(v) : undefined;
    };
    const ddd = str(/^ddd$/i);
    const numero = str(/^(numero|n[uú]mero|number|telefone|phone|celular|fone)$/i);
    if (!numero) return false;
    add(ddd && numero.replace(/\D/g, "").length <= 9 ? `${ddd}${numero}` : numero, {
      operadora: str(/operadora|carrier/i),
      tipo: str(/^tipo$|^type$/i),
    });
    return true;
  };

  const walk = (node: unknown, phoneContext: boolean) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, phoneContext));
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (phoneContext && fromObject(obj)) return;
      for (const [key, value] of Object.entries(obj)) walk(value, phoneContext || PHONE_KEY.test(key));
      return;
    }
    if (phoneContext) add(node);
  };

  walk(payload, false);
  return [...found.values()];
}
