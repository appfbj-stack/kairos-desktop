/**
 * Electron main process - cria a janela.
 */

import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { logger } from './services/logger.js';
import { startCore, stopCore, kairosCore } from './services/core-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Em dev, switches do Chromium devem ser definidos ANTES do app.ready
if (isDev) {
  app.commandLine.appendSwitch('disable-web-security');
  app.commandLine.appendSwitch('disable-features', 'IsolateOrigins,site-per-process');
}
const VITE_URL = 'http://127.0.0.1:5173';
const RENDERER_HTML = join(process.cwd(), 'dist', 'renderer', 'index.html');

let mainWindow: BrowserWindow | null = null;

async function createMainWindow() {
  const preloadPath = join(__dirname, '..', 'preload', 'index.cjs');
  logger.info({ preloadPath, exists: existsSync(preloadPath) }, 'Creating main window');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: true, // Frame nativo (mais simples pra v1; vira frameless na Fase 3.1)
    backgroundColor: '#0a0a0a',
    title: 'Kairos',
    icon: undefined, // TODO Fase 3.1
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Dev: permite fetch cross-origin para o Core
      // (em prod, o Core sera in-process ou via IPC)
      webSecurity: !app.isPackaged,
    },
  });

  // Carrega renderer
  if (isDev) {
    logger.info(`Loading Vite dev server: ${VITE_URL}`);
    await mainWindow.loadURL(VITE_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    if (!existsSync(RENDERER_HTML)) {
      logger.error(`Build nao encontrado: ${RENDERER_HTML}`);
      logger.error(`Rode "npm run build" antes de empacotar.`);
      app.quit();
      return;
    }
    logger.info(`Loading file: ${RENDERER_HTML}`);
    await mainWindow.loadFile(RENDERER_HTML);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    logger.info('Main window shown');
  });

  // Links externos abrem no browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC handlers
ipcMain.handle('chat:send', async (_event, payload) => {
  return kairosCore.chatSync(payload);
});

ipcMain.handle('chat:cancel', async (_event, conversationId: string) => {
  return kairosCore.cancelChat(conversationId);
});

ipcMain.handle('chat:history', async (_event, conversationId: string) => {
  return kairosCore.getHistory(conversationId);
});

ipcMain.handle('skills:list', () => kairosCore.listSkills?.() || []);
ipcMain.handle('memory:recall', async (_event, query: string) => kairosCore.recallMemory?.(query) || { context: '' });
ipcMain.handle('memory:store', async (_event, entity: unknown) => kairosCore.storeMemory?.(entity));
ipcMain.handle('memory:search', async (_event, query: string) => kairosCore.searchMemory?.(query) || []);
ipcMain.handle('llm:list-providers', () => kairosCore.listProviders());
ipcMain.handle('llm:list-models', (_event, provider: string) => kairosCore.listModels(provider));
ipcMain.handle('system:get-settings', () => kairosCore.getSettings?.() || {});
ipcMain.handle('system:set-setting', (_event, key: string, value: unknown) => kairosCore.setSetting?.(key, value));

app.whenReady().then(async () => {
  logger.info('Kairos Desktop starting...');
  await startCore();
  await createMainWindow();
  logger.info('Kairos Desktop ready');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

app.on('before-quit', async () => {
  await stopCore();
});
