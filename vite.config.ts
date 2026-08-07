/**
 * Vite config para o renderer do Kairos Desktop.
 *
 * Dev:   vite dev server em :5173 (Electron aponta pra ca)
 * Build: gera arquivos estaticos em dist/renderer/ (electron-builder empacota)
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  root: resolve(__dirname, 'src', 'renderer'),
  base: './',
  publicDir: resolve(__dirname, 'src', 'renderer', 'public'),
  build: {
    outDir: resolve(__dirname, 'dist', 'renderer'),
    emptyOutDir: true,
    sourcemap: isDev,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src', 'renderer'),
      '@core': resolve(__dirname, 'core'),
      '@shared': resolve(__dirname, 'src', 'shared'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    hmr: {
      overlay: false,
    },
  },
  clearScreen: false,
});
