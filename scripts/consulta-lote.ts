/**
 * Consulta em lote: lê uma planilha Excel, consulta cada telefone no Atlasender
 * e grava uma cópia da planilha com as colunas de resultado.
 *
 * Uso:
 *   npm run lote -- "C:\caminho\planilha.xlsx" [--coluna "Telefone"] [--aba "Plan1"]
 *                   [--limite 10] [--concorrencia 3] [--sim]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import ExcelJS from "exceljs";
import { codeFromStatus, type AtlasenderErrorCode } from "../src/lib/atlasender/errors";
import { phoneLookupSchema, type PhoneLookupResult } from "../src/lib/atlasender/types";
import { normalizePhone } from "../src/lib/phone";

type Outcome =
  | { ok: true; data: PhoneLookupResult }
  | { ok: false; code: AtlasenderErrorCode | "TELEFONE_INVALIDO" };

const PHONE_HEADER = /tel|cel|fone|phone|whats|contato|n[uú]mero/i;
const RESULT_HEADERS = ["Titular", "CPF", "Operadora", "Tipo", "Status consulta"];
const RETRYABLE: AtlasenderErrorCode[] = ["RATE_LIMITED", "TIMEOUT", "UPSTREAM_ERROR"];

const STATUS_LABEL: Record<string, string> = {
  NOT_FOUND: "não encontrado",
  UNAUTHORIZED: "chave recusada",
  NO_CREDITS: "sem créditos",
  RATE_LIMITED: "limite do provedor",
  TIMEOUT: "tempo esgotado",
  INVALID_RESPONSE: "resposta inválida",
  UPSTREAM_ERROR: "erro no provedor",
  TELEFONE_INVALIDO: "telefone inválido",
};

function parseArgs(argv: string[]) {
  const opts = { file: "", column: "", sheet: "", limit: Infinity, concurrency: 3, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--coluna") opts.column = argv[++i] ?? "";
    else if (a === "--aba") opts.sheet = argv[++i] ?? "";
    else if (a === "--limite") opts.limit = Number(argv[++i]);
    else if (a === "--concorrencia") opts.concurrency = Math.max(1, Math.min(10, Number(argv[++i]) || 3));
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

async function lookup(phone: string, apiKey: string, baseUrl: string): Promise<Outcome> {
  for (let attempt = 0; ; attempt++) {
    let code: AtlasenderErrorCode;
    try {
      const res = await fetch(`${baseUrl}/phone/${phone}`, {
        headers: { "X-API-Key": apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const parsed = phoneLookupSchema.safeParse(await res.json().catch(() => null));
        return parsed.success ? { ok: true, data: parsed.data } : { ok: false, code: "INVALID_RESPONSE" };
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
  const apiKey = process.env.ATLASENDER_API_KEY;
  const baseUrl = process.env.ATLASENDER_BASE_URL || "https://atlasender.com/api/cpf/v1";

  if (!opts.file) fail('Informe o arquivo: npm run lote -- "C:\\caminho\\planilha.xlsx"');
  if (!existsSync(opts.file)) fail(`Arquivo não encontrado: ${opts.file}`);
  if (!/\.xlsx$/i.test(opts.file)) fail("Use um arquivo .xlsx (no Excel: Salvar como → Pasta de Trabalho do Excel).");
  if (!apiKey) fail("ATLASENDER_API_KEY não definida. Preencha o arquivo .env.local.");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(opts.file);
  const ws = opts.sheet ? wb.getWorksheet(opts.sheet) : wb.worksheets[0];
  if (!ws) fail(`Aba não encontrada: ${opts.sheet || "(primeira)"}`);

  // Localiza a coluna de telefone pelo cabeçalho (linha 1).
  const header = ws.getRow(1);
  let phoneCol = 0;
  header.eachCell((cell, col) => {
    const text = cell.text.trim();
    if (phoneCol) return;
    if (opts.column ? text.toLowerCase() === opts.column.toLowerCase() : PHONE_HEADER.test(text)) phoneCol = col;
  });
  if (!phoneCol) {
    const names: string[] = [];
    header.eachCell((c) => names.push(`"${c.text}"`));
    fail(`Coluna de telefone não encontrada. Cabeçalhos: ${names.join(", ")}. Use --coluna "Nome".`);
  }

  // Lê as linhas e normaliza os telefones.
  const rows: { row: number; phone: string | null }[] = [];
  for (let r = 2; r <= ws.rowCount && rows.length < opts.limit; r++) {
    const raw = ws.getRow(r).getCell(phoneCol).text.trim();
    if (raw) rows.push({ row: r, phone: normalizePhone(raw) });
  }
  const unique = [...new Set(rows.map((r) => r.phone).filter((p): p is string => !!p))];

  // Cache local: reexecuções não debitam créditos de novo.
  const cachePath = opts.file.replace(/\.xlsx$/i, ".cache.json");
  const cache: Record<string, Outcome> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
  const pending = unique.filter((p) => !cache[p] || (!cache[p].ok && RETRYABLE.includes(cache[p].code as never)));

  console.log(`\nPlanilha:     ${path.basename(opts.file)} → aba "${ws.name}", coluna "${header.getCell(phoneCol).text}"`);
  console.log(`Linhas:       ${rows.length} (${rows.length - rows.filter((r) => r.phone).length} com telefone inválido)`);
  console.log(`Telefones:    ${unique.length} únicos, ${unique.length - pending.length} já consultados (cache)`);
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
  const queue = [...pending];
  await Promise.all(
    Array.from({ length: opts.concurrency }, async () => {
      while (queue.length && !stop) {
        const phone = queue.shift()!;
        const result = await lookup(phone, apiKey, baseUrl);
        cache[phone] = result;
        done++;
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
  const firstCol = ws.columnCount + 1;
  RESULT_HEADERS.forEach((h, i) => {
    const cell = header.getCell(firstCol + i);
    cell.value = h;
    cell.font = { bold: true };
  });

  const totals = { encontrados: 0, naoEncontrados: 0, erros: 0 };
  for (const { row, phone } of rows) {
    const outcome: Outcome | undefined = phone ? cache[phone] : { ok: false, code: "TELEFONE_INVALIDO" };
    const r = ws.getRow(row);
    if (outcome?.ok) {
      const d = outcome.data;
      [d.titular, d.cpf, d.operadora ?? "", d.tipo ?? "", "ok"].forEach((v, i) => (r.getCell(firstCol + i).value = v));
      totals.encontrados++;
    } else {
      const status = outcome ? STATUS_LABEL[outcome.code] : "não consultado";
      r.getCell(firstCol + 4).value = status;
      outcome?.code === "NOT_FOUND" ? totals.naoEncontrados++ : totals.erros++;
    }
  }

  const outPath = opts.file.replace(/\.xlsx$/i, "_resultado.xlsx");
  await wb.xlsx.writeFile(outPath);

  console.log(`\n\n✔ Resultado salvo em: ${outPath}`);
  console.log(`  ${totals.encontrados} encontrados · ${totals.naoEncontrados} não encontrados · ${totals.erros} erros/inválidos`);
  console.log(`  (Apague ${path.basename(cachePath)} quando terminar — ele contém dados pessoais.)\n`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
