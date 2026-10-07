import { PhoneLookup } from "@/components/phone-lookup";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-12 sm:py-20">
      <header className="mb-10">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Buscas</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Consulta por telefone</h1>
        <p className="mt-3 text-muted">
          Informe DDD + número para identificar o titular da linha. Cada consulta debita créditos e é registrada em
          auditoria.
        </p>
      </header>
      <PhoneLookup />
      <footer className="mt-auto pt-16 text-xs text-muted">
        Dados pessoais tratados conforme a LGPD. Use apenas para finalidades legítimas e autorizadas.
      </footer>
    </main>
  );
}
