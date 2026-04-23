# AGENTS.md — esticatroca-print

> Guia **autoritativo** para agentes de IA que atuam neste reposit&oacute;rio. Contexto cross-repo em [../.github/copilot-instructions.md](../.github/copilot-instructions.md).

## 1. Prop&oacute;sito

Servi&ccedil;o **local** em Node.js que roda na esta&ccedil;&atilde;o Windows da loja, ligado &agrave; impressora ESC/POS, expondo:

- **WebSocket** em `ws://localhost:6441` consumido por [../esticatroca-web/src/app/services/impressao.service.ts](../esticatroca-web/src/app/services/impressao.service.ts).
- **HTTP admin** em `http://localhost:6442` com UI para cadastro/teste/diagnostico de impressoras.

Exp&otilde;e o **contrato WebSocket** consumido pelo frontend (tipos `check-status`, `open-cashdrawer`, `print-img`, `print-data`, `print-receipt`).

**N&atilde;o** conversa com [../esticatroca-api/](../esticatroca-api/). N&atilde;o autentica — &eacute; puramente local.

## 2. Stack real

- **Node.js >= 20 LTS** + **TypeScript 5.5**, CommonJS.
- [`ws`](https://www.npmjs.com/package/ws) — servidor WebSocket.
- [`fastify`](https://www.fastify.io/) + `@fastify/static` — HTTP admin + servir `web/`.
- [`node-thermal-printer`](https://www.npmjs.com/package/node-thermal-printer) — comandos ESC/POS (EPSON/STAR/CUSTOM).
- [`@grandchef/node-printer`](https://www.npmjs.com/package/@grandchef/node-printer) — bindings nativos para spooler do Windows (usado via `printer:<Name>`).
- [`node-windows`](https://github.com/coreybutler/node-windows) — instala como servi&ccedil;o Windows com auto-restart.
- [`pino`](https://getpino.io/) + [`pino-roll`](https://github.com/mcollina/pino-roll) — logs estruturados com rota&ccedil;&atilde;o di&aacute;ria.
- [`zod`](https://zod.dev/) — valida&ccedil;&atilde;o de payloads da API admin.
- Persist&ecirc;ncia: JSON em `data/data.json`.

## 3. Estrutura

```
esticatroca-print/
├── src/
│   ├── server.ts          # entry point (boot WS + HTTP)
│   ├── ws-server.ts       # contrato WebSocket compativel com legado
│   ├── admin.ts           # Fastify + API REST + serve web/
│   ├── printer.ts         # ESC/POS via node-thermal-printer
│   ├── queue.ts           # fila serial por impressora
│   ├── windows.ts         # Get-Printer + restart-spooler
│   ├── config.ts          # PrinterConfig, PrintDatabase, I/O JSON
│   └── logger.ts          # pino + pino-roll
├── scripts/
│   ├── install-service.ts
│   └── uninstall-service.ts
├── web/                   # UI admin estatica (HTML + vanilla JS + Tailwind CDN)
├── data/                  # gerado em runtime (nao commitar data.json real)
├── logs/                  # gerado em runtime
└── dist/                  # build (gitignored)
```

## 4. Protocolo WebSocket

**URL**: `ws://localhost:6441`. **Formato**: JSON. Campo `type` obrigat&oacute;rio; `id` opcional (ecoa no ACK); `data` opcional.

| `type` | Descri&ccedil;&atilde;o | `data` |
|---|---|---|
| `check-status` | health check | — |
| `open-cashdrawer` | abre gaveta | `{printer?}` |
| `print-img` | imprime imagem PNG base64 | `{text:'data:image/png;base64,...', order?, printer?}` |
| `print-data` | recibo estruturado | `{logo?, heading?, header?, info?, items?, totals?, pre_footer?, footer?, cash_drawer?, printer?, order?}` |
| `print-receipt` | recibo formato "text" | `{text:{store_name,header,info,items,totals,payments,footer}, cash_drawer?, printer?, order?}` |

**Fallback de impressora** (identico ao legado):

1. `data.printer` explicit (objeto completo ou `{id}`) &rarr; essa.
2. `data.order` presente &rarr; todas em `order_printers`.
3. Sen&atilde;o &rarr; `receipt_printer`.

**Resposta** (novidade, n&atilde;o quebra clientes antigos):

```json
{"type": "ack", "id": "...", "ok": true, "message": "Impresso em 1"}
{"type": "error", "id": "...", "ok": false, "message": "...", "detail": "..."}
{"type": "status", "ok": true, "message": "Esticatroca Print ativo em ws://localhost:6441"}
```

A verdade &uacute;nica do protocolo &eacute; [src/ws-server.ts](src/ws-server.ts). Qualquer novo `type` aqui **exige** ajuste em [../esticatroca-web/src/app/services/impressao.service.ts](../esticatroca-web/src/app/services/impressao.service.ts).

## 5. Conven&ccedil;&otilde;es

1. **TypeScript estrito** (`"strict": true`). Nada de `any` sem justificativa.
2. **2 espa&ccedil;os**, aspas simples, ponto-e-v&iacute;rgula no fim.
3. **CommonJS** (target `ES2022`, module `commonjs`) — compat com `node-windows` que usa `require`.
4. **Sem side-effects no import** al&eacute;m de `ensureDirs()` e inicializa&ccedil;&atilde;o do `logger`.
5. **Toda opera&ccedil;&atilde;o de impress&atilde;o passa por [`PrintQueue`](src/queue.ts)** — garante serializa&ccedil;&atilde;o por impressora, log uniforme, timeout e recupera&ccedil;&atilde;o.
6. **Timeouts obrigat&oacute;rios** em qualquer I/O para impressora (ver `withTimeout` em `printer.ts`).
7. **Exce&ccedil;&otilde;es nunca derrubam o processo**: handlers em `ws-server.ts` e `unhandledRejection`/`uncaughtException` em `server.ts`.
8. **Logs estruturados**: sempre `logger.info({...contexto}, 'mensagem curta')`. Nunca `console.log` em c&oacute;digo de produ&ccedil;&atilde;o (ok em `web/app.js`).
9. **Persist&ecirc;ncia**: sempre via `readDb()`/`writeDb()` em [src/config.ts](src/config.ts). **Nunca** tocar `data/data.json` direto.
10. **Seguran&ccedil;a**: n&atilde;o exponha WS/HTTP publicamente. N&atilde;o adicione autentica&ccedil;&atilde;o parcial — se precisar, discuta arquitetura antes.

## 6. Onde mexer

| Tarefa | Local |
|---|---|
| Novo `type` de mensagem WS | novo `case` em [src/ws-server.ts](src/ws-server.ts) + m&eacute;todo em [src/printer.ts](src/printer.ts) |
| Novo endpoint admin | [src/admin.ts](src/admin.ts) |
| Mudan&ccedil;a na UI admin | [web/index.html](web/index.html) + [web/app.js](web/app.js) |
| Novo campo em `PrinterConfig` | [src/config.ts](src/config.ts) + schema Zod em [src/admin.ts](src/admin.ts) + formul&aacute;rio em `web/app.js` |
| A&ccedil;&atilde;o de diagn&oacute;stico no Windows | [src/windows.ts](src/windows.ts) |

## 7. Escopo & regras (o que **n&atilde;o** fazer)

- **N&atilde;o** quebrar compatibilidade do contrato WS (tipos e campos existentes) sem atualizar o frontend no mesmo PR.
- **N&atilde;o** adicionar autentica&ccedil;&atilde;o/JWT — servi&ccedil;o local, redes p&uacute;blicas n&atilde;o devem chegar aqui.
- **N&atilde;o** commitar `data/data.json` com dados reais de cliente. Um `data/data.example.json` &eacute; aceit&aacute;vel.
- **N&atilde;o** commitar `img/*`, `logos/*`, `logs/*`, `node_modules/`, `dist/`.
- **N&atilde;o** trocar de banco/storage por SQLite/MySQL sem motivo claro — JSON &eacute; feature, n&atilde;o d&eacute;bito.
- **N&atilde;o** introduzir depend&ecirc;ncias pesadas (Electron, Nest, Express adicional, etc.). Fastify + ws s&atilde;o suficientes.
- **N&atilde;o** fazer commit autom&aacute;tico, `git push`, `reset --hard`, `amend`, `push --force` sem pedido expl&iacute;cito.
- **N&atilde;o** refatorar oportunisticamente — mantenha consist&ecirc;ncia com os m&oacute;dulos vizinhos.

## 8. Testes

- **Aus&eacute;ncia intencional** de testes unit&aacute;rios no MVP — o valor est&aacute; em testes de integra&ccedil;&atilde;o com impressora real.
- Smoke test manual: conecte em `ws://localhost:6441` com `wscat -c ws://localhost:6441` e envie `{"type":"check-status"}`.
- Para testar impress&atilde;o, use **"Testar impress&atilde;o"** na UI admin.
- Atualize [../tests.json](../tests.json) (entrada `integration.print-receipt`) quando validar um fluxo completo.

## 9. Fluxo recomendado

1. Ler [../progress.txt](../progress.txt) e esta se&ccedil;&atilde;o.
2. Se a tarefa mexe no contrato WS &rarr; alterar **em par** com o frontend (mesmo commit l&oacute;gico).
3. `npm run dev` para iterar; `npm run build` antes de entregar.
4. Se a mudan&ccedil;a for operacional (servi&ccedil;o Windows, permiss&otilde;es), atualize [SETUP-WINDOWS.md](SETUP-WINDOWS.md).
5. Anexe ao [../progress.txt](../progress.txt): `YYYY-MM-DD | print-v2 | <resumo>`.

## 10. Checklist de entrega

- [ ] `npm run build` compila sem erros.
- [ ] `npm run dev` sobe, `GET /api/health` responde 200, WS responde `check-status`.
- [ ] Nenhum `console.log` novo em c&oacute;digo TS de produ&ccedil;&atilde;o.
- [ ] Contrato WS consistente com `impressao.service.ts`.
- [ ] Sem dados reais de cliente em `data/data.json` commitado.
- [ ] [SETUP-WINDOWS.md](SETUP-WINDOWS.md) e [README.md](README.md) atualizados se a opera&ccedil;&atilde;o mudou.
- [ ] [../progress.txt](../progress.txt) atualizado.
