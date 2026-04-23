# Esticatroca Print

Servi&ccedil;o local de impress&atilde;o ESC/POS para o ecossistema **Esticatroca**. Exp&otilde;e um WebSocket consumido por [`esticatroca-web`](../esticatroca-web/src/app/services/impressao.service.ts).

- **WebSocket** em `ws://localhost:6441` (`type`s: `check-status`, `open-cashdrawer`, `print-img`, `print-data`, `print-receipt`).
- **Admin UI** moderna em `http://localhost:6442`.
- Node.js 20+ em TypeScript. Instalado como **servi&ccedil;o do Windows** com auto-restart.
- Fila serial por impressora, timeout por job, logs rotativos, recupera&ccedil;&atilde;o do Print Spooler com um clique.

> Motiva&ccedil;&atilde;o e hist&oacute;rico est&atilde;o em [../progress.txt](../progress.txt) e no [AGENTS.md](AGENTS.md).

## Por que existe

O servi&ccedil;o anterior (em PHP) apresentava falhas recorrentes que s&oacute; eram resolvidas reiniciando o PC. Causas identificadas:

1. Depend&ecirc;ncia de compartilhamento **SMB** (`smb://HOST/PRINTER`) — sess&otilde;es expiram sem reautentica&ccedil;&atilde;o.
2. Ausencia de supervisor: `server.php` n&atilde;o tinha auto-restart em crash.
3. Biblioteca WebSocket (`hoa/websocket`) abandonada desde 2017.
4. `catch (Exception)` dentro de namespace — n&atilde;o capturava exce&ccedil;&otilde;es reais.
5. Loop WS s&iacute;ncrono: uma impressora travada derrubava todas.

Esta implementa&ccedil;&atilde;o resolve todos os pontos acima.

## Requisitos

- Windows 10 ou 11.
- [Node.js 20 LTS](https://nodejs.org/) (x64).
- Impressora ESC/POS **j&aacute; instalada no Windows** (driver do fabricante) ou acess&iacute;vel via TCP/IP (porta 9100).
- Para instalar como servi&ccedil;o, PowerShell **como administrador**.

## Instala&ccedil;&atilde;o r&aacute;pida

Ver o roteiro detalhado em [SETUP-WINDOWS.md](SETUP-WINDOWS.md).

Resumo:

```powershell
cd C:\esticatroca-print
npm ci
npm run build
npm run service:install     # uma vez, como admin
```

Acesse `http://localhost:6442/` para configurar impressoras.

> **Nota sobre `@mapbox/node-pre-gyp`**: o pacote `@grandchef/node-printer` precisa do `@mapbox/node-pre-gyp` em runtime para carregar o binding nativo, mas ele n&atilde;o est&aacute; declarado como depend&ecirc;ncia direta dele. Por isso o `package.json` deste reposit&oacute;rio lista `@mapbox/node-pre-gyp` explicitamente. Se voc&ecirc; ver `Cannot find module '@mapbox/node-pre-gyp'` ao testar impressora, rode:
>
> ```powershell
> npm install @mapbox/node-pre-gyp --save
> ```

## Desenvolvimento

```powershell
npm install
npm run dev     # watch mode via tsx
```

Vari&aacute;veis de ambiente:

| Vari&aacute;vel | Default | Descri&ccedil;&atilde;o |
|---|---|---|
| `PRINT_WS_PORT` | `6441` | Porta do WebSocket (contrato com o frontend) |
| `PRINT_HTTP_PORT` | `6442` | Porta da UI admin |
| `PRINT_HTTP_HOST` | `127.0.0.1` | Host da UI admin (mantenha local) |
| `PRINT_JOB_TIMEOUT_MS` | `15000` | Timeout por job de impress&atilde;o |
| `PRINT_LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn`, `error` |

## Contrato WebSocket

Compat&iacute;vel com o legado. Todas as mensagens s&atilde;o JSON com `type` obrigat&oacute;rio.

| `type` | Payload (`data`) | Resposta |
|---|---|---|
| `check-status` | — | `{type:'status', ok:true, message}` |
| `open-cashdrawer` | `{printer?}` | `{type:'ack', ok:true}` |
| `print-img` | `{text: 'data:image/png;base64,...', order?, printer?}` | `{type:'ack', ok:true}` |
| `print-data` | `{logo?, heading?, header?, info?, items?, totals?, pre_footer?, footer?, cash_drawer?, printer?, order?}` | `{type:'ack', ok:true}` |
| `print-receipt` | `{text:{store_name,header,info,items,totals,payments,footer}, cash_drawer?, printer?, order?}` | `{type:'ack', ok:true}` |

**Novo neste servi&ccedil;o** (opcional, n&atilde;o quebra clientes antigos): cada mensagem aceita `id` que volta no ACK, permitindo ao frontend fazer espera por confirma&ccedil;&atilde;o e retry.

Sele&ccedil;&atilde;o de impressora (mesmo fallback do legado):

1. `data.printer` explicit (objeto completo ou `{id}`) &rarr; essa impressora.
2. Sen&atilde;o, se `data.order` presente &rarr; todas em `order_printers`.
3. Sen&atilde;o &rarr; `receipt_printer`.

## API Admin HTTP

Base: `http://localhost:6442`

- `GET  /api/health` — status do servi&ccedil;o e filas.
- `GET  /api/printers` — configura&ccedil;&atilde;o persistida.
- `GET  /api/printers/discover` — enumera impressoras do Windows.
- `POST /api/printers` — adiciona/atualiza impressora.
- `DELETE /api/printers/:id`
- `PUT  /api/assignments` — define `receipt_printer` / `order_printers`.
- `POST /api/printers/:id/test` — imprime p&aacute;gina de teste.
- `POST /api/printers/:id/drawer` — abre gaveta.
- `GET  /api/printers/:id/status` — checa conex&atilde;o.
- `POST /api/system/restart-spooler` — reinicia Print Spooler (requer admin).

## Estrutura

```
esticatroca-print/
├── src/
│   ├── server.ts          # entry point (WS + HTTP)
│   ├── ws-server.ts       # WebSocket ESC/POS
│   ├── admin.ts           # Fastify + API REST
│   ├── printer.ts         # camada ESC/POS (node-thermal-printer)
│   ├── queue.ts           # fila serial por impressora
│   ├── windows.ts         # discovery + restart spooler
│   ├── config.ts          # persistencia em data/data.json
│   └── logger.ts          # pino + pino-roll
├── scripts/
│   ├── install-service.ts # node-windows installer
│   └── uninstall-service.ts
├── web/                   # UI admin (estatica)
├── data/data.json         # persistencia (gerado)
├── logs/                  # rotacao diaria, 14 dias
└── SETUP-WINDOWS.md       # roteiro de instalacao
```

## Licen&ccedil;a

Proprietary - Esticatroca.
