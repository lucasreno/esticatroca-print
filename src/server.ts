import { ensureDirs } from './config';
import { logger } from './logger';
import { startWsServer } from './ws-server';
import { startAdminServer } from './admin';

async function main() {
  ensureDirs();
  const wss = startWsServer();
  const app = await startAdminServer();

  let shuttingDown = false;
  const shutdown = async (signal: string, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Iniciando shutdown gracioso');
    // timeout de segurança para não pendurar o processo
    const killer = setTimeout(() => {
      logger.warn('Shutdown excedeu 10s, forcando exit');
      process.exit(exitCode);
    }, 10_000);
    killer.unref?.();
    try {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Falha ao fechar WS');
    }
    try {
      await app.close();
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Falha ao fechar admin HTTP');
    }
    // Dá um tempo para o transport do pino drenar
    await new Promise((r) => setTimeout(r, 200));
    process.exit(exitCode);
  };

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason: (reason as Error)?.message ?? reason }, 'unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    // Estado potencialmente corrompido: derrubar e deixar o supervisor
    // (node-windows / systemd) reiniciar em vez de continuar.
    logger.error({ err: err.message, stack: err.stack }, 'uncaughtException — encerrando');
    void shutdown('uncaughtException', 1);
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

main().catch((err) => {
  logger.error({ err: err.message, stack: err.stack }, 'Falha ao iniciar servico');
  process.exit(1);
});
