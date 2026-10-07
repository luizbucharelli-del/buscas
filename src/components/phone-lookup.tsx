"use client";

import { useState, useTransition } from "react";
import { normalizePhone } from "@/lib/phone";
import { ResultCard } from "./result-card";
import type { LookupResponse } from "./types";

type State =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "success"; data: LookupResponse };

export function PhoneLookup() {
  const [value, setValue] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const phone = normalizePhone(value);
    if (!phone) {
      setState({ kind: "error", message: "Telefone inválido. Use DDD + número, ex.: (11) 99999-8888." });
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/consulta/telefone/${phone}`, { cache: "no-store" });
        const body = await res.json();
        setState(res.ok ? { kind: "success", data: body } : { kind: "error", message: body.error ?? "Erro inesperado." });
      } catch {
        setState({ kind: "error", message: "Falha de conexão. Tente novamente." });
      }
    });
  }

  return (
    <section aria-label="Consulta" className="space-y-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row" noValidate>
        <label htmlFor="phone" className="sr-only">
          Telefone
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="(11) 99999-8888"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={state.kind === "error"}
          aria-describedby={state.kind === "error" ? "phone-error" : undefined}
          className="h-12 flex-1 rounded-xl border border-line bg-surface px-4 font-mono text-base outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-12 rounded-xl bg-accent px-6 font-medium text-accent-ink transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30 disabled:opacity-60"
        >
          {pending ? "Consultando…" : "Consultar"}
        </button>
      </form>

      <div aria-live="polite">
        {state.kind === "error" && (
          <p id="phone-error" role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {state.message}
          </p>
        )}
        {state.kind === "success" && <ResultCard data={state.data} />}
      </div>
    </section>
  );
}
