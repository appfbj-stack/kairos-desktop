/**
 * Kairos Desktop AI - Electron main process entry point.
 *
 * Responsabilidades:
 *  - Lifecycle do app (ready, window-all-closed, before-quit)
 *  - Criar a janela principal
 *  - Registrar IPC handlers
 *  - Iniciar o Kairos AI Core (Fastify)
 *  - Configurar system tray + global hotkeys
 *  - Auto-update (electron-updater)
 *
 * @see docs/ARCHITECTURE.md §3 (mapa de modulos)
 */

import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window.js';
import { registerIpcHandlers } from './ipc/index.js';
import { startCore, stopCore } from './services/core-bridge.js';
import { setupTray } from './services/system-tray.js';
import { setupGlobalHotkeys } from './services/global-hotkeys.js';
import { setupAutoUpdater } from './services/auto-updater.js';
import { logger } from './services/logger.js';

let mainWindow: BrowserWindow | null = null;

async function bootstrap() {
  logger.info('Kairos Desktop AI starting...');

  // 1. Inicia o Kairos AI Core (Fastify) em background
  await startCore();

  // 2. Registra handlers IPC
  registerIpcHandlers();

  // 3. Cria janela principal
  mainWindow = await createMainWindow();

  // 4. System tray
  setupTray(mainWindow);

  // 5. Global hotkeys
  setupGlobalHotkeys();

  // 6. Auto-update (em background)
  setupAutoUpdater();

  logger.info('Kairos Desktop AI ready');
}

app.whenReady().then(bootstrap).catch((err) => {
  logger.error({ err }, 'Bootstrap failed');
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = await createMainWindow();
  }
});

app.on('before-quit', async () => {
  await stopCore();
  logger.info('Kairos Desktop AI stopped');
});
