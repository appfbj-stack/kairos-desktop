/**
 * Preload script - context bridge entre Electron main e renderer.
 *
 * IMPORTANTE: Electron 33 tem problemas pra carregar preload como ESM (.js)
 * mesmo com package.json "type": "module". Solucao: compilar como CommonJS
 * e salvar como .cjs (o sufixo .cjs forca CommonJS independente do package.json).
 *
 * Expoe API segura (sem nodeIntegration) para o React renderer via
 * contextBridge. Operacoes vao via IPC -> main process -> Core.
 */

import { contextBridge, ipcRenderer } from 'electron';

export const api = {
  chat: {
    send: (payload: unknown) => ipcRenderer.invoke('chat:send', payload),
    cancel: (conversationId: string) => ipcRenderer.invoke('chat:cancel', conversationId),
    history: (conversationId: string) => ipcRenderer.invoke('chat:history', conversationId),
  },
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
  },
  memory: {
    recall: (query: string) => ipcRenderer.invoke('memory:recall', query),
    store: (entity: unknown) => ipcRenderer.invoke('memory:store', entity),
    search: (query: string) => ipcRenderer.invoke('memory:search', query),
  },
  llm: {
    listProviders: () => ipcRenderer.invoke('llm:list-providers'),
    listModels: (provider: string) => ipcRenderer.invoke('llm:list-models', provider),
  },
  system: {
    getSettings: () => ipcRenderer.invoke('system:get-settings'),
    setSetting: (key: string, value: unknown) => ipcRenderer.invoke('system:set-setting', key, value),
  },
  upload: {
    /**
     * Abre dialog.showOpenDialog no main process, lê o arquivo selecionado,
     * faz upload via /upload e retorna o ChatAttachment.
     */
    pickAndUpload: () => ipcRenderer.invoke('upload:pick'),
  },
};

try {
  contextBridge.exposeInMainWorld('kairos', api);
  // eslint-disable-next-line no-console
  console.log('[Kairos preload] window.kairos exposto:', Object.keys(api));
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('[Kairos preload] ERRO ao expor API:', err);
}

export type KairosApi = typeof api;
