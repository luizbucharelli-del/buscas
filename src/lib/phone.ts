/**
 * Normaliza um telefone brasileiro para o formato aceito pela API: DDD + número (10 ou 11 dígitos).
 * Aceita entradas como "(11) 99999-8888", "+55 11 99999-8888" ou "11999998888".
 */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  if (!/^[1-9]{2}\d{8,9}$/.test(digits)) return null;
  if (digits.length === 11 && digits[2] !== "9") return null;
  return digits;
}

export function formatPhone(digits: string): string {
  return digits.length === 11
    ? digits.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3")
    : digits.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
}

export function formatCpf(cpf: string): string {
  return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

/** Exibe só os dígitos centrais do CPF (padrão de mascaramento LGPD): ***.456.789-** */
export function maskCpf(cpf: string): string {
  return cpf.replace(/^\d{3}(\d{3})(\d{3})\d{2}$/, "***.$1.$2-**");
}
