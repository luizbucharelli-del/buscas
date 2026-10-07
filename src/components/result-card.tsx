"use client";

import { useState } from "react";
import { formatCpf, formatPhone, maskCpf } from "@/lib/phone";
import type { LookupResponse } from "./types";

export function ResultCard({ data }: { data: LookupResponse }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <p className="text-xs uppercase tracking-wider text-muted">Titular</p>
        <p className="mt-1 text-lg font-semibold">{data.titular}</p>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-line">
        <Field label="Telefone" value={formatPhone(data.telefone)} mono />
        <Field
          label="CPF"
          mono
          value={
            <span className="flex items-center gap-2">
              {revealed ? formatCpf(data.cpf) : maskCpf(data.cpf)}
              <button
                type="button"
                onClick={() => setRevealed((v) => !v)}
                aria-pressed={revealed}
                className="rounded-md px-1.5 py-0.5 font-sans text-xs text-accent hover:bg-accent-soft"
              >
                {revealed ? "ocultar" : "mostrar"}
              </button>
            </span>
          }
        />
        <Field label="Operadora" value={data.operadora ?? "—"} />
        <Field label="Tipo" value={data.tipo ?? "—"} />
      </dl>
      {data.meta && (
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          {data.meta.creditsDebited} crédito(s) · {data.meta.latencyMs} ms
        </p>
      )}
    </article>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="bg-surface px-5 py-4">
      <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
      <dd className={`mt-1 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
