/**
 * Logger centralizado (pino).
 *
 * - Em dev: pino-pretty com cores
 * - Em prod: JSON estruturado em arquivo
 */

import pino from 'pino';
import { join } from 'node:path';
import { app } from 'electron';

const isDev = !app.isPackaged;
const logDir = join(app.getPath('userData'), 'logs');

export const logger = pino({
  level: process.env.KAIROS_LOG_LEVEL || 'info',
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss' },
        },
      }
    : {
        destination: join(logDir, 'kairos.log'),
      }),
  base: { service: 'kairos-desktop' },
});
