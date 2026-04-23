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
export const WS_HOST = process.env.PRINT_WS_HOST ?? '127.0.0.1';
export const HTTP_PORT = Number(process.env.PRINT_HTTP_PORT ?? 6442);
export const HTTP_HOST = process.env.PRINT_HTTP_HOST ?? '127.0.0.1';
export const JOB_TIMEOUT_MS = Number(process.env.PRINT_JOB_TIMEOUT_MS ?? 15_000);

/**
 * Payload máximo aceito pelo WebSocket. Default 4 MiB cobre imagens de
 * recibo razoáveis (base64 de PNG ~1-2 MB) sem permitir OOM trivial.
 */
export const WS_MAX_PAYLOAD = Number(process.env.PRINT_WS_MAX_PAYLOAD ?? 4 * 1024 * 1024);

/**
 * Lista separada por vírgulas de origens HTTP permitidas para conectar no
 * WebSocket e no admin HTTP. Protege contra CSWSH / DNS rebinding. Por
 * padrão aceita apenas os hosts loopback e a origem nula (ferramentas de
 * CLI como `wscat` enviam sem Origin).
 */
const RAW_ALLOWED_ORIGINS = (process.env.PRINT_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
export const ALLOWED_ORIGINS = new Set<string>([
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost',
  'http://127.0.0.1',
  `http://localhost:${HTTP_PORT}`,
  `http://127.0.0.1:${HTTP_PORT}`,
  ...RAW_ALLOWED_ORIGINS,
]);
export const ALLOW_NO_ORIGIN =
  (process.env.PRINT_ALLOW_NO_ORIGIN ?? '1') !== '0';

/**
 * Default column width for 80mm thermal printers using ESC/POS font A
 * (48 columns ≈ 576 dots). Override per-printer via `char_per_line`.
 */
export const DEFAULT_CHAR_PER_LINE = 48;

/**
 * Default character set for Brazilian ESC/POS printers. WPC1252 (Windows-1252)
 * cobre todo o português com acentuação correta e é o mais compatível entre
 * Bematech, Bixolon, Epson, Elgin e afins. Override per-printer via
 * `character_set` (ver `SUPPORTED_CHARACTER_SETS`).
 */
export const DEFAULT_CHARACTER_SET = 'WPC1252';

/**
 * Conjuntos de caracteres selecionáveis na UI admin. Os valores devem
 * corresponder exatamente aos membros do enum `CharacterSet` da
 * biblioteca `node-thermal-printer`.
 */
export const SUPPORTED_CHARACTER_SETS = [
  'WPC1252',
  'PC850_MULTILINGUAL',
  'PC860_PORTUGUESE',
  'PC858_EURO',
  'PC437_USA',
] as const;
export type SupportedCharacterSet = (typeof SUPPORTED_CHARACTER_SETS)[number];

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
  /** Characters per line (42 for 58mm, 48 for 80mm). Default: 48. */
  char_per_line?: number;
  /** Printer family for node-thermal-printer: 'epson' | 'star' | 'custom' */
  driver?: 'epson' | 'star' | 'custom';
  /**
   * Code page enviado à impressora. Default: WPC1252. Valores suportados
   * estão em `SUPPORTED_CHARACTER_SETS`.
   */
  character_set?: string;
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
  } catch (err) {
    // Corrupção do arquivo: preservar o original para inspeção, NÃO
    // sobrescrever silenciosamente com um DB vazio na próxima writeDb.
    try {
      const backup = `${DATA_FILE}.corrupt-${Date.now()}`;
      if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, backup);
      // eslint-disable-next-line no-console
      console.error(
        `[config] data.json corrompido (${(err as Error).message}). ` +
          `Backup em ${backup}. Retornando DB vazio temporariamente.`,
      );
    } catch {
      /* ignore backup failures */
    }
    return { ...EMPTY_DB };
  }
}

export function writeDb(db: PrintDatabase): void {
  ensureDirs();
  const tmp = `${DATA_FILE}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, JSON.stringify(db, null, 2));
    try {
      fs.fsyncSync(fd);
    } catch {
      /* fsync pode falhar em alguns FS (ex.: FAT); não é fatal */
    }
  } finally {
    fs.closeSync(fd);
  }
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
