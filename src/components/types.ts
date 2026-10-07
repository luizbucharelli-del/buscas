export type LookupResponse = {
  telefone: string;
  titular: string;
  cpf: string;
  operadora: string | null;
  tipo: string | null;
  meta: { creditsDebited: number; latencyMs: number } | null;
};
