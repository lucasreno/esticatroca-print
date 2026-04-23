import { logger } from './logger';
import type { PrinterConfig } from './config';

type Job = () => Promise<void>;

interface QueueEntry {
  queue: Array<{ job: Job; resolve: () => void; reject: (err: Error) => void }>;
  running: boolean;
}

/**
 * Per-printer serialized queue. Prevents racing jobs from stepping on each
 * other in the Windows spooler and gives us a single chokepoint for retries,
 * logging, and metrics.
 */
export class PrintQueue {
  private queues = new Map<string, QueueEntry>();

  enqueue(printer: PrinterConfig, label: string, job: Job): Promise<void> {
    let entry = this.queues.get(printer.id);
    if (!entry) {
      entry = { queue: [], running: false };
      this.queues.set(printer.id, entry);
    }
    return new Promise<void>((resolve, reject) => {
      entry!.queue.push({ job: () => this.wrap(printer, label, job), resolve, reject });
      this.drain(printer.id);
    });
  }

  private async drain(printerId: string): Promise<void> {
    const entry = this.queues.get(printerId);
    if (!entry || entry.running) return;
    entry.running = true;
    while (entry.queue.length > 0) {
      const item = entry.queue.shift()!;
      try {
        await item.job();
        item.resolve();
      } catch (err) {
        item.reject(err as Error);
      }
    }
    entry.running = false;
  }

  private async wrap(printer: PrinterConfig, label: string, job: Job): Promise<void> {
    const started = Date.now();
    logger.info({ printer: printer.id, title: printer.title, label }, 'Job iniciado');
    try {
      await job();
      logger.info(
        { printer: printer.id, label, durationMs: Date.now() - started },
        'Job concluido',
      );
    } catch (err) {
      logger.error(
        {
          printer: printer.id,
          title: printer.title,
          label,
          durationMs: Date.now() - started,
          err: (err as Error).message,
        },
        'Job falhou',
      );
      throw err;
    }
  }

  stats(): Record<string, { pending: number; running: boolean }> {
    const out: Record<string, { pending: number; running: boolean }> = {};
    for (const [id, entry] of this.queues) {
      out[id] = { pending: entry.queue.length, running: entry.running };
    }
    return out;
  }
}

export const printQueue = new PrintQueue();
