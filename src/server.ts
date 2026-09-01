import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV, apiPrefix: env.API_PREFIX },
    `Servidor escuchando en http://localhost:${env.PORT}${env.API_PREFIX}`,
  );
});

const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'Cerrando servidor...');

  const forceExit = setTimeout(() => {
    logger.error('Cierre forzado: quedaron conexiones abiertas');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close((err) => {
    if (err) {
      logger.error({ err }, 'Error al cerrar el servidor');
      process.exit(1);
    }
    logger.info('Servidor cerrado correctamente');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Promesa rechazada sin manejar');
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Excepcion no capturada');
  shutdown('uncaughtException');
});
