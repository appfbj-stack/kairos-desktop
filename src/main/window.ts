/**
 * BrowserWindow factory - Cria a janela principal do Kairos.
 */

import { BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { logger } from './services/logger.js';

const isDev = process.env.NODE_ENV === 'development' || !appIsPackaged();

function appIsPackaged(): boolean {
  // electron.app.isPackaged nao esta disponivel no momento da importacao lazy
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron');
    return app.isPackaged;
  } catch {
    return false;
  }
}

export async function createMainWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    frame: false, // Frameless para custom titlebar
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0a',
    icon: join(process.cwd(), 'resources', 'icons', 'kairos.png'),
    webPreferences: {
      preload: join(process.cwd(), 'dist', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Permitir require no preload por enquanto
    },
  });

  // Carrega renderer
  if (isDev) {
    await win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(join(process.cwd(), 'dist', 'renderer', 'index.html'));
  }

  // Mostra janela quando carrega
  win.once('ready-to-show', () => {
    win.show();
    logger.info('Main window shown');
  });

  // Links externos abrem no browser, nao no app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}
