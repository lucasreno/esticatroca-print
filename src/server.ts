import { ensureDirs } from './config';
import { logger } from './logger';
import { startWsServer } from './ws-server';
import { startAdminServer } from './admin';

async function main() {
  ensureDirs();
  startWsServer();
  await startAdminServer();

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason: (reason as Error)?.message ?? reason }, 'unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    logger.error({ err: err.message, stack: err.stack }, 'uncaughtException');
  });
  process.on('SIGINT', () => {
    logger.info('SIGINT recebido, encerrando');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    logger.info('SIGTERM recebido, encerrando');
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err: err.message, stack: err.stack }, 'Falha ao iniciar servico');
  process.exit(1);
});
