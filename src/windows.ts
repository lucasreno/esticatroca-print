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
  connectionName?: string;
  computerName?: string;
  network?: boolean;
  source?: 'get-printer' | 'wmi';
}

function toArray<T>(value: unknown): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? (value as T[]) : ([value] as T[]);
}

function looksNetworkPort(portName?: string): boolean {
  if (!portName) return false;
  const p = portName.trim().toLowerCase();
  if (!p) return false;
  return (
    p.startsWith('\\\\') ||
    p.startsWith('ip_') ||
    p.startsWith('tcp') ||
    p.startsWith('wsd') ||
    p.includes(':')
  );
}

async function runPowerShellJson(script: string): Promise<unknown | undefined> {
  const escapedScript = script.replace(/"/g, '\\"');
  const psCmd = [
    'powershell.exe',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `"${escapedScript}"`,
  ].join(' ');
  const { stdout } = await pexec(psCmd, { timeout: 10_000, windowsHide: true });
  if (!stdout.trim()) return undefined;
  return JSON.parse(stdout.trim()) as unknown;
}

/**
 * Lists Windows printers via PowerShell Get-Printer.
 * Falls back to `wmic` for very old Windows. Returns [] on non-Windows.
 */
export async function listWindowsPrinters(): Promise<DiscoveredPrinter[]> {
  if (process.platform !== 'win32') return [];

  try {
    const getPrinterRaw = await runPowerShellJson(
      'Get-Printer | Select-Object Name,PrinterStatus,Default,ShareName,PortName,DriverName,Type,ComputerName,ConnectionName | ConvertTo-Json -Compress',
    );
    const cimRaw = await runPowerShellJson(
      'Get-CimInstance Win32_Printer | Select-Object Name,PrinterStatus,Default,ShareName,PortName,DriverName,Network,Local,ServerName,SystemName | ConvertTo-Json -Compress',
    );

    const merged = new Map<string, DiscoveredPrinter>();

    const upsert = (incoming: DiscoveredPrinter) => {
      const name = incoming.name?.trim();
      if (!name) return;
      const key = name.toLowerCase();
      const prev = merged.get(key);
      if (!prev) {
        merged.set(key, incoming);
        return;
      }
      merged.set(key, {
        ...prev,
        ...incoming,
        // Mantem true se qualquer fonte indicar impressora de rede.
        network: Boolean(prev.network || incoming.network),
      });
    };

    for (const item of toArray<Record<string, unknown>>(getPrinterRaw)) {
      const name = item.Name != null ? String(item.Name) : '';
      const portName = item.PortName ? String(item.PortName) : undefined;
      const connectionName = item.ConnectionName ? String(item.ConnectionName) : undefined;
      const type = item.Type != null ? String(item.Type).toLowerCase() : '';
      const network =
        Boolean(connectionName) ||
        type.includes('network') ||
        type.includes('connection') ||
        looksNetworkPort(portName);
      upsert({
        name,
        status: item.PrinterStatus != null ? String(item.PrinterStatus) : undefined,
        default: typeof item.Default === 'boolean' ? item.Default : undefined,
        shareName: item.ShareName ? String(item.ShareName) : undefined,
        portName,
        driverName: item.DriverName ? String(item.DriverName) : undefined,
        computerName: item.ComputerName ? String(item.ComputerName) : undefined,
        connectionName,
        network,
        source: 'get-printer',
      });
    }

    for (const item of toArray<Record<string, unknown>>(cimRaw)) {
      const name = item.Name != null ? String(item.Name) : '';
      const portName = item.PortName ? String(item.PortName) : undefined;
      const network =
        (typeof item.Network === 'boolean' && item.Network) ||
        (!(typeof item.Local === 'boolean' && item.Local) && looksNetworkPort(portName));
      upsert({
        name,
        status: item.PrinterStatus != null ? String(item.PrinterStatus) : undefined,
        default: typeof item.Default === 'boolean' ? item.Default : undefined,
        shareName: item.ShareName ? String(item.ShareName) : undefined,
        portName,
        driverName: item.DriverName ? String(item.DriverName) : undefined,
        computerName: item.SystemName ? String(item.SystemName) : undefined,
        connectionName: item.ServerName ? String(item.ServerName) : undefined,
        network,
        source: 'wmi',
      });
    }

    const result = Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
    if (result.length > 0) return result;
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
