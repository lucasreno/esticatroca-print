import path from 'node:path';
import crypto from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import { logger } from './logger';
import {
  HTTP_HOST,
  HTTP_PORT,
  WEB_DIR,
  ALLOWED_ORIGINS,
  ALLOW_NO_ORIGIN,
  findPrinter,
  readDb,
  writeDb,
  type PrinterConfig,
  DEFAULT_CHAR_PER_LINE,
  DEFAULT_CHARACTER_SET,
  SUPPORTED_CHARACTER_SETS,
} from './config';
import { listWindowsPrinters, restartSpooler } from './windows';
import { checkConnection, openCashDrawer, printTestPage } from './printer';
import { printQueue } from './queue';

const PrinterSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  // 'file' removido: type=file permitia escrever em qualquer caminho como
  // SYSTEM. Se precisar futuramente, restringir a um diretório allow-listed.
  type: z.enum(['windows', 'network']),
  path: z.string().max(260).optional(),
  ip_address: z.string().optional(),
  port: z.number().int().positive().max(65535).optional(),
  profile: z.string().optional(),
  char_per_line: z.number().int().min(20).max(96).optional(),
  driver: z.enum(['epson', 'star', 'custom']).optional(),
  character_set: z.string().optional(),
  timeout_ms: z.number().int().positive().max(120000).optional(),
});

const AssignmentSchema = z.object({
  receipt_printer: z.string().optional(),
  order_printers: z.array(z.string()).optional(),
});

export async function startAdminServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, disableRequestLogging: true });

  // Hardening: barra CSRF/DNS-rebinding validando Origin e Host em toda
  // requisição mutante. GETs seguem liberados.
  app.addHook('onRequest', async (req, reply) => {
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
    const host = ((req.headers.host as string) ?? '').split(':')[0].toLowerCase();
    if (host && host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
      reply.code(403).send({ ok: false, message: 'Host nao permitido' });
      return reply;
    }
    const origin = req.headers.origin as string | undefined;
    if (!origin) {
      if (!ALLOW_NO_ORIGIN) {
        reply.code(403).send({ ok: false, message: 'Origin obrigatoria' });
        return reply;
      }
      return;
    }
    if (!ALLOWED_ORIGINS.has(origin)) {
      reply.code(403).send({ ok: false, message: 'Origin nao permitida' });
      return reply;
    }
  });

  await app.register(fastifyStatic, {
    root: path.resolve(WEB_DIR),
    prefix: '/',
    index: ['index.html'],
  });

  app.get('/api/health', async () => ({
    ok: true,
    service: 'esticatroca-print',
    version: require('../package.json').version,
    queue: printQueue.stats(),
  }));

  app.get('/api/meta', async () => ({
    default_char_per_line: DEFAULT_CHAR_PER_LINE,
    default_character_set: DEFAULT_CHARACTER_SET,
    character_sets: SUPPORTED_CHARACTER_SETS,
  }));

  app.get('/api/printers', async () => readDb());

  app.get('/api/printers/discover', async () => {
    const discovered = await listWindowsPrinters();
    return { ok: true, printers: discovered };
  });

  app.post('/api/printers', async (req, reply) => {
    const parsed = PrinterSchema.parse(req.body);
    const db = readDb();
    const id = parsed.id ?? crypto.randomBytes(8).toString('hex');
    const existing = db.printers.findIndex((p) => p.id === id);
    const cfg: PrinterConfig = { ...parsed, id };
    if (existing >= 0) db.printers[existing] = cfg;
    else db.printers.push(cfg);
    if (!db.receipt_printer) db.receipt_printer = id;
    writeDb(db);
    return reply.send({ ok: true, printer: cfg });
  });

  app.delete('/api/printers/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = readDb();
    db.printers = db.printers.filter((p) => p.id !== id);
    db.order_printers = db.order_printers.filter((p) => p !== id);
    if (db.receipt_printer === id) db.receipt_printer = db.printers[0]?.id ?? '';
    writeDb(db);
    return reply.send({ ok: true });
  });

  app.put('/api/assignments', async (req, reply) => {
    const parsed = AssignmentSchema.parse(req.body);
    const db = readDb();
    if (parsed.receipt_printer !== undefined) db.receipt_printer = parsed.receipt_printer;
    if (parsed.order_printers !== undefined) db.order_printers = parsed.order_printers;
    writeDb(db);
    return reply.send({ ok: true, db });
  });

  app.post('/api/printers/:id/test', async (req, reply) => {
    const { id } = req.params as { id: string };
    const cfg = findPrinter(id);
    if (!cfg) return reply.code(404).send({ ok: false, message: 'Impressora nao encontrada' });
    try {
      await printQueue.enqueue(cfg, 'admin-test', () => printTestPage(cfg));
      return reply.send({ ok: true });
    } catch (err) {
      return reply.code(500).send({ ok: false, message: (err as Error).message });
    }
  });

  app.post('/api/printers/:id/drawer', async (req, reply) => {
    const { id } = req.params as { id: string };
    const cfg = findPrinter(id);
    if (!cfg) return reply.code(404).send({ ok: false, message: 'Impressora nao encontrada' });
    try {
      await printQueue.enqueue(cfg, 'admin-drawer', () => openCashDrawer(cfg));
      return reply.send({ ok: true });
    } catch (err) {
      return reply.code(500).send({ ok: false, message: (err as Error).message });
    }
  });

  app.get('/api/printers/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string };
    const cfg = findPrinter(id);
    if (!cfg) return reply.code(404).send({ ok: false, message: 'Impressora nao encontrada' });
    const result = await checkConnection(cfg);
    return reply.send(result);
  });

  app.post('/api/system/restart-spooler', async (_req, reply) => {
    const result = await restartSpooler();
    return reply.code(result.ok ? 200 : 500).send(result);
  });

  await app.listen({ host: HTTP_HOST, port: HTTP_PORT });
  logger.info({ host: HTTP_HOST, port: HTTP_PORT }, 'Admin HTTP escutando');
  return app;
}

