/**
 * Consulta em lote: lê uma planilha Excel, consulta cada linha no Atlasender
 * e grava uma cópia da planilha com as colunas de resultado.
 *
 * Modos:
 *   --modo telefone (padrão)  telefone → titular/CPF       GET /phone/:phone
 *   --modo cpf                CPF      → nome/celulares    GET /cpf/:cpf (fixos são descartados)
 *
 * Uso:
 *   npm run lote -- "C:\caminho\planilha.xlsx" [--modo cpf] [--coluna "CPF"] [--aba "Plan1"]
 *                   [--limite 10] [--concorrencia 3] [--mostrar-resposta] [--sim]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import ExcelJS from "exceljs";
import { codeFromStatus, type AtlasenderErrorCode } from "../src/lib/atlasender/errors";
import { extractPhones } from "../src/lib/atlasender/extract-phones";
import { normalizeCpf } from "../src/lib/cpf";
import { formatPhone, isMobile, normalizePhone } from "../src/lib/phone";

type Outcome = { ok: true; data: Record<string, unknown> } | { ok: false; code: AtlasenderErrorCode };
type Cell = string | number | null;

type Mode = {
  label: string;
  header: RegExp;
  normalize: (raw: string) => string | null;
  endpoint: string;
  /** Cabeçalhos e valores das colunas de resultado, dado o conjunto de respostas. */
  columns: (results: Record<string, unknown>[]) => {
    headers: string[];
    cells: (data: Record<string, unknown>) => Cell[];
  };
};

const MAX_PHONES = 5;
/** Só celulares — fixos são descartados. */
const mobilePhones = (d: Record<string, unknown>) => extractPhones(d).filter((p) => isMobile(p.numero));
const text = (v: unknown): Cell => (typeof v === "string" || typeof v === "number" ? v : null);

const MODES: Record<string, Mode> = {
  telefone: {
    label: "telefone",
    header: /tel|cel|fone|phone|whats|contato|n[uú]mero/i,
    normalize: normalizePhone,
    endpoint: "phone",
    columns: () => ({
      headers: ["Titular", "CPF", "Operadora", "Tipo"],
      cells: (d) => [text(d.titular), text(d.cpf), text(d.operadora), text(d.tipo)],
    }),
  },
  cpf: {
    label: "CPF",
    header: /cpf|documento|doc/i,
    normalize: normalizeCpf,
    endpoint: "cpf",
    columns: (results) => {
      const count = Math.min(MAX_PHONES, Math.max(1, ...results.map((r) => mobilePhones(r).length)));
      const headers = ["Nome"];
      for (let i = 1; i <= count; i++) headers.push(`Telefone ${i}`, `Operadora ${i}`, `Tipo ${i}`);
      return {
        headers,
        cells: (d) => {
          const phones = mobilePhones(d);
          const row: Cell[] = [text(d.nome ?? d.titular)];
          for (let i = 0; i < count; i++) {
            const p = phones[i];
            row.push(p ? formatPhone(p.numero) : null, p?.operadora ?? null, p?.tipo ?? null);
          }
          return row;
        },
      };
    },
  },
};

const RETRYABLE: AtlasenderErrorCode[] = ["RATE_LIMITED", "TIMEOUT", "UPSTREAM_ERROR"];
const STATUS_LABEL: Record<string, string> = {
  NOT_FOUND: "não encontrado",
  UNAUTHORIZED: "chave recusada",
  NO_CREDITS: "sem créditos",
  RATE_LIMITED: "limite do provedor",
  TIMEOUT: "tempo esgotado",
  INVALID_RESPONSE: "resposta inválida",
  UPSTREAM_ERROR: "erro no provedor",
};

function parseArgs(argv: string[]) {
  const opts = {
    file: "",
    mode: "telefone",
    column: "",
    sheet: "",
    limit: Infinity,
    concurrency: 3,
    showResponse: false,
    yes: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--modo") opts.mode = (argv[++i] ?? "").toLowerCase();
    else if (a === "--coluna") opts.column = argv[++i] ?? "";
    else if (a === "--aba") opts.sheet = argv[++i] ?? "";
    else if (a === "--limite") opts.limit = Number(argv[++i]);
    else if (a === "--concorrencia") opts.concurrency = Math.max(1, Math.min(10, Number(argv[++i]) || 3));
    else if (a === "--mostrar-resposta") opts.showResponse = true;
    else if (a === "--sim") opts.yes = true;
    else if (!a.startsWith("--")) opts.file = a;
  }
  return opts;
}

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lookup(url: string, apiKey: string): Promise<Outcome> {
  for (let attempt = 0; ; attempt++) {
    let code: AtlasenderErrorCode;
    try {
      const res = await fetch(url, {
        headers: { "X-API-Key": apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const data: unknown = await res.json().catch(() => null);
        return data && typeof data === "object" && !Array.isArray(data)
          ? { ok: true, data: data as Record<string, unknown> }
          : { ok: false, code: "INVALID_RESPONSE" };
      }
      code = codeFromStatus(res.status);
    } catch (err) {
      code = err instanceof DOMException && err.name === "TimeoutError" ? "TIMEOUT" : "UPSTREAM_ERROR";
    }
    if (!RETRYABLE.includes(code) || attempt >= 3) return { ok: false, code };
    await sleep(2 ** attempt * 2_000);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const mode = MODES[opts.mode];
  const apiKey = process.env.ATLASENDER_API_KEY;
  const baseUrl = process.env.ATLASENDER_BASE_URL || "https://atlasender.com/api/cpf/v1";

  if (!mode) fail(`Modo inválido: "${opts.mode}". Use --modo telefone ou --modo cpf.`);
  if (!opts.file) fail('Informe o arquivo: npm run lote -- "C:\\caminho\\planilha.xlsx"');
  if (!existsSync(opts.file)) fail(`Arquivo não encontrado: ${opts.file}`);
  if (!/\.xlsx$/i.test(opts.file)) fail("Use um arquivo .xlsx (no Excel: Salvar como → Pasta de Trabalho do Excel).");
  if (!apiKey) fail("ATLASENDER_API_KEY não definida. Preencha o arquivo .env.local.");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(opts.file);
  const ws = opts.sheet ? wb.getWorksheet(opts.sheet) : wb.worksheets[0];
  if (!ws) fail(`Aba não encontrada: ${opts.sheet || "(primeira)"}`);

  // Localiza a coluna de entrada pelo cabeçalho (linha 1).
  const header = ws.getRow(1);
  let inputCol = 0;
  header.eachCell((cell, col) => {
    const name = cell.text.trim();
    if (inputCol) return;
    if (opts.column ? name.toLowerCase() === opts.column.toLowerCase() : mode.header.test(name)) inputCol = col;
  });
  if (!inputCol) {
    const names: string[] = [];
    header.eachCell((c) => names.push(`"${c.text}"`));
    fail(`Coluna de ${mode.label} não encontrada. Cabeçalhos: ${names.join(", ")}. Use --coluna "Nome".`);
  }

  // Lê e normaliza as linhas.
  const rows: { row: number; key: string | null }[] = [];
  for (let r = 2; r <= ws.rowCount && rows.length < opts.limit; r++) {
    const raw = ws.getRow(r).getCell(inputCol).text.trim();
    if (raw) rows.push({ row: r, key: mode.normalize(raw) });
  }
  const unique = [...new Set(rows.map((r) => r.key).filter((k): k is string => !!k))];

  // Cache local: reexecuções não debitam créditos de novo.
  const cachePath = opts.file.replace(/\.xlsx$/i, `.${mode.endpoint}.cache.json`);
  const cache: Record<string, Outcome> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
  const pending = unique.filter((k) => {
    const c = cache[k];
    return !c || (!c.ok && RETRYABLE.includes(c.code));
  });

  console.log(`\nModo:         ${mode.label} → aba "${ws.name}", coluna "${header.getCell(inputCol).text}"`);
  console.log(`Linhas:       ${rows.length} (${rows.filter((r) => !r.key).length} com ${mode.label} inválido)`);
  console.log(`Únicos:       ${unique.length}, ${unique.length - pending.length} já consultados (cache)`);
  console.log(`A consultar:  ${pending.length} → até ${pending.length} crédito(s)\n`);

  if (pending.length && !opts.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("Confirmar consulta? (s/N) ");
    rl.close();
    if (!/^s/i.test(answer.trim())) fail("Cancelado. Nenhum crédito foi usado.");
  }

  // Consulta com concorrência limitada.
  let done = 0;
  let stop = false;
  let shown = false;
  const queue = [...pending];
  await Promise.all(
    Array.from({ length: opts.concurrency }, async () => {
      while (queue.length && !stop) {
        const key = queue.shift()!;
        const result = await lookup(`${baseUrl}/${mode.endpoint}/${key}`, apiKey);
        cache[key] = result;
        done++;
        if (opts.showResponse && result.ok && !shown) {
          shown = true;
          console.log(`\nResposta crua do primeiro resultado:\n${JSON.stringify(result.data, null, 2)}\n`);
        }
        process.stdout.write(`\r  ${done}/${pending.length} consultados`);
        if (done % 10 === 0) writeFileSync(cachePath, JSON.stringify(cache));
        if (!result.ok && (result.code === "NO_CREDITS" || result.code === "UNAUTHORIZED")) {
          stop = true;
          console.error(`\n✖ Interrompido: ${STATUS_LABEL[result.code]}.`);
        }
      }
    }),
  );
  writeFileSync(cachePath, JSON.stringify(cache));

  // Grava os resultados em novas colunas.
  const successes = unique.map((k) => cache[k]).flatMap((o) => (o?.ok ? [o.data] : []));
  const { headers, cells } = mode.columns(successes);
  const firstCol = ws.columnCount + 1;
  const statusCol = firstCol + headers.length;
  [...headers, "Status consulta"].forEach((h, i) => {
    const cell = header.getCell(firstCol + i);
    cell.value = h;
    cell.font = { bold: true };
  });

  const totals = { encontrados: 0, semTelefone: 0, naoEncontrados: 0, erros: 0 };
  for (const { row, key } of rows) {
    const r = ws.getRow(row);
    const outcome = key ? cache[key] : undefined;
    if (outcome?.ok) {
      cells(outcome.data).forEach((v, i) => (r.getCell(firstCol + i).value = v));
      const noPhones = mode === MODES.cpf && mobilePhones(outcome.data).length === 0;
      r.getCell(statusCol).value = noPhones ? "sem celular" : "ok";
      noPhones ? totals.semTelefone++ : totals.encontrados++;
    } else {
      r.getCell(statusCol).value = !key
        ? `${mode.label} inválido`
        : outcome
          ? STATUS_LABEL[outcome.code]
          : "não consultado";
      outcome?.code === "NOT_FOUND" ? totals.naoEncontrados++ : totals.erros++;
    }
  }

  const outPath = opts.file.replace(/\.xlsx$/i, "_resultado.xlsx");
  await wb.xlsx.writeFile(outPath);

  console.log(`\n\n✔ Resultado salvo em: ${outPath}`);
  const parts = [`${totals.encontrados} com resultado`];
  if (mode === MODES.cpf) parts.push(`${totals.semTelefone} sem celular`);
  parts.push(`${totals.naoEncontrados} não encontrados`, `${totals.erros} erros/inválidos`);
  console.log(`  ${parts.join(" · ")}`);
  if (mode === MODES.cpf && successes.length && totals.encontrados === 0) {
    console.log("  ⚠ Nenhum celular reconhecido. Rode com --limite 1 --mostrar-resposta e me envie o formato.");
  }
  console.log(`  (Apague ${path.basename(cachePath)} quando terminar — ele contém dados pessoais.)\n`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
