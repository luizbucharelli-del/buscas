# Buscas — Consulta por telefone (Atlasender)

Painel interno em Next.js que consulta titular/CPF por número de telefone via
[Atlasender](https://atlasender.com) — `GET /api/cpf/v1/phone/:phone`.

## Arquitetura

```
Navegador ──Basic Auth──▶ /api/consulta/telefone/:phone ──X-API-Key──▶ atlasender.com
                           (validação, rate limit, auditoria)
```

A chave **nunca** chega ao navegador: só o servidor chama o Atlasender.

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/atlasender/` | Cliente tipado (timeout, validação da resposta com zod, erros mapeados) |
| `src/lib/env.ts` | Validação das variáveis de ambiente (somente servidor) |
| `src/app/api/consulta/telefone/[phone]/route.ts` | Endpoint interno |
| `src/middleware.ts` | HTTP Basic Auth em todo o app |
| `src/lib/rate-limit.ts` | Limite por IP (em memória) |
| `src/lib/audit.ts` | Log de auditoria LGPD (telefone em hash, sem CPF/nome) |

## Configuração

```bash
cp .env.example .env.local   # preencha ATLASENDER_API_KEY, APP_USERNAME e APP_PASSWORD
npm install
npm run dev                  # http://localhost:3000
```

Teste direto do endpoint:

```bash
curl -u usuario:senha http://localhost:3000/api/consulta/telefone/11999998888
```

Resposta:

```json
{
  "telefone": "11999998888",
  "titular": "JOAO SILVA SANTOS",
  "cpf": "12345678900",
  "operadora": "VIVO",
  "tipo": "MOVEL",
  "meta": { "creditsDebited": 1, "latencyMs": 310 }
}
```

Erros: `400` telefone inválido · `402` sem créditos · `404` não encontrado ·
`429` limite atingido · `502/504` falha no provedor.

## Consulta em lote (Excel)

```bash
npm run lote -- "C:\Users\sindi\Downloads\buscas\planilha.xlsx"
```

Dois modos:

| Modo | Entrada | Retorno | Endpoint |
| --- | --- | --- | --- |
| `--modo telefone` (padrão) | telefone | titular, CPF, operadora, tipo | `GET /phone/:phone` |
| `--modo cpf` | CPF | nome e até 5 celulares `(11) 99999-9999` com operadora e tipo — fixos são descartados | `GET /cpf/:cpf` |

```bash
npm run lote -- "C:\Users\sindi\Downloads\buscas\planilha.xlsx" --modo cpf --limite 1 --mostrar-resposta
```

- No modo CPF, os dígitos verificadores são validados antes da consulta (CPF inválido não gasta crédito)
  e CPFs que o Excel truncou (sem zeros à esquerda) são corrigidos.
- `--mostrar-resposta` imprime o JSON do primeiro resultado — útil para conferir o formato dos telefones.
- Detecta a coluna de entrada pelo cabeçalho (Telefone, Celular, Fone, WhatsApp…) — ou use `--coluna "Nome"`.
- Mostra quantos créditos serão usados e pede confirmação (`--sim` pula).
- `--limite 5` consulta só as 5 primeiras linhas (bom para testar). `--aba "Plan2"` escolhe a aba.
- Gera `planilha_resultado.xlsx` com as colunas originais + resultado + Status.
- Telefones repetidos são consultados uma vez; `planilha.<modo>.cache.json` evita debitar de novo
  se você rodar outra vez. Apague o cache ao terminar (contém dados pessoais).
- Para automaticamente se acabarem os créditos ou a chave for recusada.

## Deploy (Vercel)

Cadastre as mesmas variáveis em *Project → Settings → Environment Variables*.
Com várias instâncias, troque o rate limit em memória por Upstash Redis.

## LGPD

Nome e CPF são dados pessoais. O painel exige login, mascara o CPF por padrão,
não guarda cache das respostas (`Cache-Control: no-store`) e registra cada consulta
para auditoria. Use apenas com base legal e finalidade legítima.
