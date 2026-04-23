import path from 'node:path';
import pino from 'pino';
import { LOGS_DIR, ensureDirs } from './config';

ensureDirs();

const transport = pino.transport({
  targets: [
    {
      target: 'pino/file',
      level: process.env.PRINT_LOG_LEVEL ?? 'info',
      options: { destination: 1 },
    },
    {
      target: 'pino-roll',
      level: process.env.PRINT_LOG_LEVEL ?? 'info',
      options: {
        file: path.join(LOGS_DIR, 'print'),
        frequency: 'daily',
        mkdir: true,
        size: '10m',
        limit: { count: 14 },
        extension: '.log',
      },
    },
  ],
});

export const logger = pino(
  {
    level: process.env.PRINT_LOG_LEVEL ?? 'info',
    base: { service: 'esticatroca-print' },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport,
);
