import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from './logger';

const pexec = promisify(exec);

export interface DiscoveredPrinter {
  name: string;
  status?: string;
  default?: boolean;
  shareName?: string;
  portName?: string;
  driverName?: string;
}

/**
 * Lists Windows printers via PowerShell Get-Printer.
 * Falls back to `wmic` for very old Windows. Returns [] on non-Windows.
 */
export async function listWindowsPrinters(): Promise<DiscoveredPrinter[]> {
  if (process.platform !== 'win32') return [];

  try {
    const psCmd = [
      'powershell.exe',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '"Get-Printer | Select-Object Name,PrinterStatus,ShareName,PortName,DriverName | ConvertTo-Json -Compress"',
    ].join(' ');
    const { stdout } = await pexec(psCmd, { timeout: 10_000, windowsHide: true });
    if (!stdout.trim()) return [];
    const parsed = JSON.parse(stdout.trim()) as unknown;
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map((p: any) => ({
      name: String(p.Name),
      status: p.PrinterStatus != null ? String(p.PrinterStatus) : undefined,
      shareName: p.ShareName ? String(p.ShareName) : undefined,
      portName: p.PortName ? String(p.PortName) : undefined,
      driverName: p.DriverName ? String(p.DriverName) : undefined,
    }));
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Falha ao listar impressoras via PowerShell; tentando fallback');
  }

  try {
    const { stdout } = await pexec('wmic printer get Name,PrinterStatus,ShareName /format:csv', {
      timeout: 10_000,
      windowsHide: true,
    });
    const lines = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('Node'));
    return lines.map((line) => {
      const cols = line.split(',');
      return { name: cols[1] ?? '', status: cols[2], shareName: cols[3] };
    });
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Falha ao enumerar impressoras');
    return [];
  }
}

/**
 * Restarts the Windows Print Spooler service. Requires admin privileges.
 * Used as an operator-triggered recovery action.
 */
export async function restartSpooler(): Promise<{ ok: boolean; output: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, output: 'Not running on Windows' };
  }
  try {
    const { stdout, stderr } = await pexec('net stop spooler && net start spooler', {
      timeout: 30_000,
      windowsHide: true,
    });
    const output = `${stdout}\n${stderr}`.trim();
    logger.info({ output }, 'Print Spooler reiniciado');
    return { ok: true, output };
  } catch (err) {
    const message = (err as Error).message;
    logger.error({ err: message }, 'Falha ao reiniciar Print Spooler');
    return { ok: false, output: message };
  }
}
