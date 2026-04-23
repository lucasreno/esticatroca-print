import { WebSocketServer, WebSocket } from 'ws';
import { logger } from './logger';
import {
  WS_PORT,
  WS_HOST,
  WS_MAX_PAYLOAD,
  ALLOWED_ORIGINS,
  ALLOW_NO_ORIGIN,
  findPrinter,
  getOrderPrinters,
  getReceiptPrinter,
  type PrinterConfig,
} from './config';
import { printQueue } from './queue';
import {
  openCashDrawer,
  printImageBase64,
  printReceipt,
  type ReceiptPayload,
} from './printer';

interface IncomingMessage {
  type: string;
  id?: string | number;
  data?: any;
}

interface OutgoingAck {
  type: 'ack' | 'error' | 'status';
  id?: string | number;
  ok: boolean;
  message?: string;
  detail?: string;
}

export function startWsServer(): WebSocketServer {
  const wss = new WebSocketServer({
    port: WS_PORT,
    host: WS_HOST,
    maxPayload: WS_MAX_PAYLOAD,
    verifyClient: (info, done) => {
      // Barra CSWSH e DNS rebinding: exige Origin conhecida e Host loopback.
      const origin = info.req.headers.origin;
      const host = ((info.req.headers.host as string) ?? '').split(':')[0].toLowerCase();
      const hostOk =
        host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '';
      if (!hostOk) {
        logger.warn({ host, origin }, 'WS rejeitado: host nao-loopback');
        return done(false, 403, 'Forbidden');
      }
      if (!origin) {
        if (ALLOW_NO_ORIGIN) return done(true);
        logger.warn('WS rejeitado: Origin ausente');
        return done(false, 403, 'Origin required');
      }
      if (ALLOWED_ORIGINS.has(origin)) return done(true);
      logger.warn({ origin }, 'WS rejeitado: Origin nao permitida');
      return done(false, 403, 'Origin not allowed');
    },
  });

  wss.on('listening', () => {
    logger.info({ host: WS_HOST, port: WS_PORT }, 'WebSocket de impressao escutando');
  });

  wss.on('connection', (socket, req) => {
    const peer = req.socket.remoteAddress ?? 'unknown';
    logger.info({ peer }, 'Cliente conectado');

    socket.on('message', async (raw) => {
      let msg: IncomingMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch (err) {
        return send(socket, {
          type: 'error',
          ok: false,
          message: 'JSON invalido',
          detail: (err as Error).message,
        });
      }

      try {
        await handleMessage(socket, msg);
      } catch (err) {
        logger.error({ err: (err as Error).message, type: msg.type }, 'Falha ao processar mensagem');
        send(socket, {
          type: 'error',
          id: msg.id,
          ok: false,
          message: 'Falha ao processar mensagem',
          detail: (err as Error).message,
        });
      }
    });

    socket.on('close', () => logger.info({ peer }, 'Cliente desconectado'));
    socket.on('error', (err) => logger.warn({ peer, err: err.message }, 'Erro no socket'));
  });

  return wss;
}

function send(socket: WebSocket, payload: OutgoingAck | string): void {
  try {
    socket.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Falha ao enviar resposta');
  }
}

async function handleMessage(socket: WebSocket, msg: IncomingMessage): Promise<void> {
  switch (msg.type) {
    case 'check-status': {
      send(socket, {
        type: 'status',
        id: msg.id,
        ok: true,
        message: `Esticatroca Print ativo em ws://localhost:${WS_PORT}`,
      });
      return;
    }

    case 'open-cashdrawer': {
      const printer = pickPrinter(msg.data?.printer);
      if (!printer) return send(socket, notFound(msg.id));
      await printQueue.enqueue(printer, 'open-cashdrawer', () => openCashDrawer(printer));
      send(socket, { type: 'ack', id: msg.id, ok: true, message: 'Gaveta aberta' });
      return;
    }

    case 'print-img': {
      const payload = msg.data ?? {};
      const base64 = payload.text as string | undefined;
      if (!base64) {
        return send(socket, {
          type: 'error',
          id: msg.id,
          ok: false,
          message: 'data.text (imagem base64) obrigatorio',
        });
      }
      const targets = resolveTargets(payload);
      if (targets.length === 0) return send(socket, notFound(msg.id));
      await Promise.all(
        targets.map((printer) =>
          printQueue.enqueue(printer, 'print-img', () => printImageBase64(printer, base64)),
        ),
      );
      send(socket, { type: 'ack', id: msg.id, ok: true, message: `Impresso em ${targets.length}` });
      return;
    }

    case 'print-data':
    case 'print-receipt': {
      const payload = normalizeReceiptPayload(msg.data);
      const targets = resolveTargets(payload);
      if (targets.length === 0) return send(socket, notFound(msg.id));
      await Promise.all(
        targets.map((printer) =>
          printQueue.enqueue(printer, msg.type, () => printReceipt(printer, payload)),
        ),
      );
      send(socket, { type: 'ack', id: msg.id, ok: true, message: `Impresso em ${targets.length}` });
      return;
    }

    default:
      send(socket, {
        type: 'error',
        id: msg.id,
        ok: false,
        message: `Tipo desconhecido: ${msg.type}`,
      });
  }
}

function notFound(id: IncomingMessage['id']): OutgoingAck {
  return {
    type: 'error',
    id,
    ok: false,
    message: 'Nenhuma impressora configurada',
    detail: 'Configure uma impressora em http://localhost:6442/ antes de imprimir.',
  };
}

function pickPrinter(raw: unknown): PrinterConfig | undefined {
  // Segurança: NUNCA confiar em { type, path } vindo do cliente WS. Isso
  // permitiria path traversal em type='file' (escrita arbitrária como
  // SYSTEM) e uso de impressoras não cadastradas. Aceitar apenas { id }
  // e resolver via configuração local.
  if (raw && typeof raw === 'object') {
    const candidate = raw as { id?: unknown };
    if (typeof candidate.id === 'string' && candidate.id) {
      const found = findPrinter(candidate.id);
      if (found) return found;
      logger.warn({ id: candidate.id }, 'pickPrinter: id desconhecido, caindo para receipt');
    }
  }
  return getReceiptPrinter();
}

function resolveTargets(payload: any): PrinterConfig[] {
  if (payload?.printer) {
    const p = pickPrinter(payload.printer);
    if (p) return [p];
    logger.warn({ printer: payload.printer }, 'resolveTargets: printer invalido, fallback para receipt');
  }
  if (payload?.order !== undefined && payload?.order !== null && payload?.order !== '') {
    const orderPrinters = getOrderPrinters();
    if (orderPrinters.length > 0) return orderPrinters;
  }
  const receipt = getReceiptPrinter();
  return receipt ? [receipt] : [];
}

function normalizeReceiptPayload(raw: unknown): ReceiptPayload & { printer?: any; order?: any } {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return (raw as any) ?? {};
}

