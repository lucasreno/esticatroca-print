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
  source?: 'get-printer' | 'wmi' | 'registry';
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
    /^ne\d+:$/.test(p)
  );
}

async function runPowerShellJson(script: string): Promise<unknown | undefined> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const psCmd = [
    'powershell.exe',
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    encoded,
  ].join(' ');
  const { stdout } = await pexec(psCmd, { timeout: 10_000, windowsHide: true });
  if (!stdout.trim()) return undefined;
  return JSON.parse(stdout.trim()) as unknown;
}

function stringValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s ? s : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  return undefined;
}

function mapPrinterItem(
  item: Record<string, unknown>,
  source: DiscoveredPrinter['source'],
): DiscoveredPrinter {
  const name = stringValue(item.Name) ?? '';
  const portName = stringValue(item.PortName);
  const connectionName = stringValue(item.ConnectionName) ?? stringValue(item.ServerName);
  const type = stringValue(item.Type)?.toLowerCase() ?? '';
  const network =
    booleanValue(item.Network) === true ||
    Boolean(connectionName) ||
    type.includes('network') ||
    type.includes('connection') ||
    looksNetworkPort(portName);

  return {
    name,
    status: stringValue(item.PrinterStatus),
    default: booleanValue(item.Default),
    shareName: stringValue(item.ShareName),
    portName,
    driverName: stringValue(item.DriverName),
    computerName: stringValue(item.ComputerName) ?? stringValue(item.SystemName),
    connectionName,
    network,
    source,
  };
}

function mergePrinter(prev: DiscoveredPrinter, incoming: DiscoveredPrinter): DiscoveredPrinter {
  return {
    name: incoming.name || prev.name,
    status: incoming.status ?? prev.status,
    default: Boolean(prev.default || incoming.default) || undefined,
    shareName: incoming.shareName ?? prev.shareName,
    portName: incoming.portName ?? prev.portName,
    driverName: incoming.driverName ?? prev.driverName,
    connectionName: incoming.connectionName ?? prev.connectionName,
    computerName: incoming.computerName ?? prev.computerName,
    network: Boolean(prev.network || incoming.network),
    source: prev.source ?? incoming.source,
  };
}

async function collectPowerShellPrinters(
  source: DiscoveredPrinter['source'],
  script: string,
  upsert: (printer: DiscoveredPrinter) => void,
): Promise<void> {
  try {
    const raw = await runPowerShellJson(script);
    for (const item of toArray<Record<string, unknown>>(raw)) {
      upsert(mapPrinterItem(item, source));
    }
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, source },
      'Falha ao listar impressoras via PowerShell',
    );
  }
}

/**
 * Lists Windows printers via PowerShell Get-Printer.
 * Falls back to `wmic` for very old Windows. Returns [] on non-Windows.
 */
export async function listWindowsPrinters(): Promise<DiscoveredPrinter[]> {
  if (process.platform !== 'win32') return [];

  const merged = new Map<string, DiscoveredPrinter>();
  const upsert = (incoming: DiscoveredPrinter) => {
    const name = incoming.name.trim();
    if (!name) return;
    const key = name.toLowerCase();
    const prev = merged.get(key);
    merged.set(key, prev ? mergePrinter(prev, incoming) : { ...incoming, name });
  };

  await collectPowerShellPrinters(
    'get-printer',
    'Get-Printer | Select-Object Name,PrinterStatus,Default,ShareName,PortName,DriverName,Type,ComputerName,ConnectionName | ConvertTo-Json -Compress',
    upsert,
  );

  await collectPowerShellPrinters(
    'wmi',
    'Get-CimInstance Win32_Printer | Select-Object Name,PrinterStatus,Default,ShareName,PortName,DriverName,Network,Local,ServerName,SystemName | ConvertTo-Json -Compress',
    upsert,
  );

  await collectPowerShellPrinters(
    'registry',
    `
$items = @()
$localRoot = 'Registry::HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Print\\Printers'
Get-ChildItem -Path $localRoot -ErrorAction SilentlyContinue | ForEach-Object {
  $props = Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue
  $port = $props.Port
  $driver = $props.'Printer Driver'
  $items += [pscustomobject]@{
    Name = $_.PSChildName
    PrinterStatus = $null
    Default = $null
    ShareName = $props.ShareName
    PortName = $port
    DriverName = $driver
    Network = ($port -match '^(IP_|TCP|WSD)' -or $port -like ([string]::Concat([char]92, [char]92, '*')) -or $port -match '^Ne\d+:$')
    ServerName = $null
    SystemName = $env:COMPUTERNAME
  }
}
Get-ChildItem -Path 'Registry::HKEY_USERS' -ErrorAction SilentlyContinue | ForEach-Object {
  $connections = Join-Path $_.PSPath 'Printers\\Connections'
  Get-ChildItem -Path $connections -ErrorAction SilentlyContinue | ForEach-Object {
    $props = Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue
    $parts = @($_.PSChildName -split ',' | Where-Object { $_ })
    $server = $props.Server
    $printer = $props.Printer
    if (-not $server -and $parts.Count -ge 1) { $server = $parts[0] }
    if (-not $printer -and $parts.Count -ge 2) { $printer = ($parts[1..($parts.Count - 1)] -join ',') }
    $name = $props.Name
    if (-not $name -and $server -and $printer) { $name = [string]::Concat([char]92, [char]92, $server, [char]92, $printer) }
    if (-not $name) { $name = $_.PSChildName }
    $items += [pscustomobject]@{
      Name = $name
      PrinterStatus = $null
      Default = $null
      ShareName = $printer
      PortName = $name
      DriverName = $null
      Network = $true
      ServerName = $server
      SystemName = $env:COMPUTERNAME
    }
  }
}
$items | ConvertTo-Json -Compress
`,
    upsert,
  );

  const result = Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
  if (result.length > 0) return result;

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
      const name = cols[1] ?? '';
      return {
        name,
        status: cols[2],
        shareName: cols[3],
        network: name.trim().startsWith('\\\\'),
        source: 'wmi',
      };
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
