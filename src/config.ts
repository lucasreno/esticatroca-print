import path from 'node:path';
import fs from 'node:fs';

export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const LOGS_DIR = path.join(ROOT, 'logs');
export const IMG_DIR = path.join(ROOT, 'img');
export const LOGOS_DIR = path.join(ROOT, 'logos');
export const WEB_DIR = path.join(ROOT, 'web');

export const DATA_FILE = path.join(DATA_DIR, 'data.json');

export const WS_PORT = Number(process.env.PRINT_WS_PORT ?? 6441);
export const HTTP_PORT = Number(process.env.PRINT_HTTP_PORT ?? 6442);
export const HTTP_HOST = process.env.PRINT_HTTP_HOST ?? '127.0.0.1';
export const JOB_TIMEOUT_MS = Number(process.env.PRINT_JOB_TIMEOUT_MS ?? 15_000);

export function ensureDirs(): void {
  for (const dir of [DATA_DIR, LOGS_DIR, IMG_DIR, LOGOS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

export type PrinterType = 'windows' | 'network' | 'file';

export interface PrinterConfig {
  id: string;
  title: string;
  type: PrinterType;
  /** Windows printer name (type=windows), device path (type=file) or unused for network */
  path?: string;
  /** For type=network */
  ip_address?: string;
  /** For type=network */
  port?: number;
  /** ESC/POS capability profile: 'default', 'simple', 'SP2000', etc. */
  profile?: string;
  /** Characters per line (42 for 58mm, 48/80 for 80mm) */
  char_per_line?: number;
  /** Printer family for node-thermal-printer: 'epson' | 'star' | 'custom' */
  driver?: 'epson' | 'star' | 'custom';
  /** Milliseconds to wait for a job before considering the printer stuck */
  timeout_ms?: number;
}

export interface PrintDatabase {
  printers: PrinterConfig[];
  receipt_printer: string;
  order_printers: string[];
}

const EMPTY_DB: PrintDatabase = {
  printers: [],
  receipt_printer: '',
  order_printers: [],
};

export function readDb(): PrintDatabase {
  try {
    if (!fs.existsSync(DATA_FILE)) return { ...EMPTY_DB };
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    if (!raw.trim()) return { ...EMPTY_DB };
    const parsed = JSON.parse(raw) as Partial<PrintDatabase>;
    return {
      printers: Array.isArray(parsed.printers) ? parsed.printers : [],
      receipt_printer: parsed.receipt_printer ?? '',
      order_printers: Array.isArray(parsed.order_printers) ? parsed.order_printers : [],
    };
  } catch {
    return { ...EMPTY_DB };
  }
}

export function writeDb(db: PrintDatabase): void {
  ensureDirs();
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

export function getReceiptPrinter(db = readDb()): PrinterConfig | undefined {
  return db.printers.find((p) => p.id === db.receipt_printer);
}

export function getOrderPrinters(db = readDb()): PrinterConfig[] {
  return db.printers.filter((p) => db.order_printers.includes(p.id));
}

export function findPrinter(id: string, db = readDb()): PrinterConfig | undefined {
  return db.printers.find((p) => p.id === id);
}
