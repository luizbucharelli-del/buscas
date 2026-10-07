/**
 * Normaliza um CPF para 11 dígitos e valida os dígitos verificadores.
 * Aceita "123.456.789-09", "12345678909" e números que o Excel truncou (sem zeros à esquerda).
 */
export function normalizeCpf(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 11) return null;
  const cpf = digits.padStart(11, "0");
  if (/^(\d)\1{10}$/.test(cpf)) return null;

  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]) ? cpf : null;
}
