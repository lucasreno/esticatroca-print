/* eslint-disable @typescript-eslint/no-var-requires */
import { logger } from './logger';
import type { PrinterConfig } from './config';
import { JOB_TIMEOUT_MS } from './config';

// node-thermal-printer has no bundled types; load at runtime and cast.
// Lazy-require so the service still boots on machines where the native
// driver failed to install — callers will get a clear error per-job.
let printerLib: any = null;
function loadPrinterLib(): any {
  if (printerLib) return printerLib;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    printerLib = require('node-thermal-printer');
    return printerLib;
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'node-thermal-printer indisponivel');
    throw new Error('node-thermal-printer nao carregou. Rode `npm install` no diretorio do servico.');
  }
}

export interface ReceiptPayload {
  logo?: string;
  heading?: string;
  header?: string | string[];
  info?: Array<{ label: string; value: string }>;
  items?: Array<{
    product_name: string;
    quantity: string | number;
    unit_price: string | number;
    subtotal: string | number;
  }>;
  totals?: Array<{ label: string; value: string }>;
  pre_footer?: Array<{ label: string; value: string }>;
  footer?: string | string[];
  text?: {
    store_name?: string;
    header?: string;
    info?: string;
    items?: string;
    totals?: string;
    payments?: string;
    footer?: string;
  };
  cash_drawer?: boolean;
}

function buildInterface(cfg: PrinterConfig): string {
  if (cfg.type === 'network') {
    const ip = cfg.ip_address?.trim();
    if (!ip) throw new Error(`Impressora ${cfg.id} (${cfg.title}): ip_address vazio`);
    const port = cfg.port ?? 9100;
    return `tcp://${ip}:${port}`;
  }
  if (cfg.type === 'file') {
    if (!cfg.path) throw new Error(`Impressora ${cfg.id}: path vazio`);
    return cfg.path;
  }
  // windows
  if (!cfg.path) throw new Error(`Impressora ${cfg.id} (${cfg.title}): nome da impressora Windows vazio`);
  // node-thermal-printer uses the literal `printer:<Name>` form to route
  // via the local Windows spooler (through @grandchef/node-printer), which
  // avoids the SMB/UNC fragility of the old PHP stack.
  return `printer:${cfg.path}`;
}

function buildPrinter(cfg: PrinterConfig) {
  const lib = loadPrinterLib();
  // node-thermal-printer v4 exposes: { printer: ThermalPrinter (class),
  //   types: PrinterTypes, characterSet: CharacterSet }
  const PrinterTypes = lib.types ?? lib.PrinterTypes;
  const CharacterSet = lib.characterSet ?? lib.CharacterSet;
  const driverMap: Record<string, any> = {
    epson: PrinterTypes.EPSON,
    star: PrinterTypes.STAR,
    custom: PrinterTypes.CUSTOM,
  };
  const type = driverMap[cfg.driver ?? 'epson'] ?? PrinterTypes.EPSON;
  const ThermalPrinter = lib.printer;
  const p = new ThermalPrinter({
    type,
    interface: buildInterface(cfg),
    characterSet: CharacterSet?.PC860_PORTUGUESE,
    removeSpecialCharacters: false,
    lineCharacter: '-',
    width: cfg.char_per_line ?? 42,
    options: { timeout: cfg.timeout_ms ?? JOB_TIMEOUT_MS },
  });
  return p;
}

function formatLine(label: string, value: string, width: number): string {
  const free = Math.max(1, width - label.length - value.length);
  return `${label}${' '.repeat(free)}${value}`;
}

export async function checkConnection(cfg: PrinterConfig): Promise<{ ok: boolean; detail?: string }> {
  try {
    const p = buildPrinter(cfg);
    const ok = await withTimeout(p.isPrinterConnected(), cfg.timeout_ms ?? JOB_TIMEOUT_MS);
    return { ok: Boolean(ok) };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

export async function openCashDrawer(cfg: PrinterConfig): Promise<void> {
  const p = buildPrinter(cfg);
  p.openCashDrawer();
  await withTimeout(p.execute(), cfg.timeout_ms ?? JOB_TIMEOUT_MS);
}

export async function printTestPage(cfg: PrinterConfig): Promise<void> {
  const p = buildPrinter(cfg);
  p.alignCenter();
  p.bold(true);
  p.println('== TESTE DE IMPRESSAO ==');
  p.bold(false);
  p.println(`Impressora: ${cfg.title}`);
  p.println(`ID: ${cfg.id}`);
  p.println(new Date().toLocaleString('pt-BR'));
  p.drawLine();
  p.alignLeft();
  p.println('Esticatroca - servico de impressao local');
  p.println('Se voce esta lendo isto, a impressora respondeu.');
  p.newLine();
  p.cut();
  await withTimeout(p.execute(), cfg.timeout_ms ?? JOB_TIMEOUT_MS);
}

/**
 * Prints a receipt matching the "print-receipt" payload
 * (compat with `esticatroca-web/src/app/services/impressao.service.ts`).
 */
export async function printReceipt(cfg: PrinterConfig, data: ReceiptPayload): Promise<void> {
  const p = buildPrinter(cfg);
  const width = cfg.char_per_line ?? 42;

  if (data.logo) {
    try {
      p.alignCenter();
      await p.printImage(data.logo);
    } catch (err) {
      logger.warn({ err: (err as Error).message, logo: data.logo }, 'Falha ao imprimir logo');
    }
  }

  // Legacy "text" block (simple multi-section format used by esticatroca-web)
  if (data.text) {
    p.alignCenter();
    if (data.text.store_name) {
      p.bold(true);
      p.setTextDoubleHeight();
      p.setTextDoubleWidth();
      p.println(data.text.store_name.replace(/\\n/g, '\n'));
      p.setTextNormal();
      p.bold(false);
    }
    if (data.text.header) p.println(data.text.header.replace(/\\n/g, '\n'));
    p.alignLeft();
    if (data.text.info) p.println(data.text.info.replace(/\\n/g, '\n'));
    if (data.text.items) p.println(data.text.items.replace(/\\n/g, '\n'));
    if (data.text.totals) {
      p.drawLine();
      p.println(data.text.totals.replace(/\\n/g, '\n'));
    }
    if (data.text.payments) {
      p.drawLine();
      p.println(data.text.payments.replace(/\\n/g, '\n'));
    }
    if (data.text.footer) {
      p.alignCenter();
      p.println(data.text.footer.replace(/\\n/g, '\n'));
    }
  }

  // Structured "print-data" style block
  if (data.heading) {
    p.alignCenter();
    p.bold(true);
    p.setTextDoubleHeight();
    p.setTextDoubleWidth();
    p.println(data.heading);
    p.setTextNormal();
    p.bold(false);
    p.newLine();
  }

  if (data.header) {
    p.alignCenter();
    const headers = Array.isArray(data.header) ? data.header : [data.header];
    headers.forEach((h) => p.println(h));
    p.newLine();
  }

  p.alignLeft();

  if (data.info?.length) {
    data.info.forEach((row) => p.println(`${row.label}: ${row.value}`));
    p.newLine();
  }

  if (data.items?.length) {
    data.items.forEach((item, idx) => {
      p.println(`#${idx + 1} ${item.product_name}`);
      p.println(formatLine(`   ${item.quantity} x ${item.unit_price}`, `${item.subtotal}`, width));
    });
    p.newLine();
  }

  if (data.totals?.length) {
    data.totals.forEach((t) => {
      if (t.label === 'line') p.drawLine();
      else p.println(formatLine(`${t.label}:`, t.value, width));
    });
    p.newLine();
  }

  if (data.pre_footer?.length) {
    data.pre_footer.forEach((row) => p.println(`${row.label}: ${row.value}`));
    p.newLine();
  }

  if (data.footer) {
    p.alignCenter();
    p.newLine();
    const footers = Array.isArray(data.footer) ? data.footer : [data.footer];
    footers.forEach((f) => p.println(f));
    p.newLine();
  }

  p.cut();
  if (data.cash_drawer) p.openCashDrawer();

  await withTimeout(p.execute(), cfg.timeout_ms ?? JOB_TIMEOUT_MS);
}

export async function printImageBase64(cfg: PrinterConfig, dataUrl: string): Promise<void> {
  const p = buildPrinter(cfg);
  p.alignCenter();
  await p.printImageBuffer(dataUrlToBuffer(dataUrl));
  p.newLine();
  p.newLine();
  p.cut();
  await withTimeout(p.execute(), cfg.timeout_ms ?? JOB_TIMEOUT_MS);
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const match = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl.trim());
  const b64 = match ? match[1] : dataUrl;
  return Buffer.from(b64, 'base64');
}

function withTimeout<T>(promise: Promise<T> | T, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(`Timeout de ${ms}ms excedido na impressao`));
    }, ms);
    Promise.resolve(promise).then(
      (v) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
