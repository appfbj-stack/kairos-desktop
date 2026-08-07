/**
 * Preload script - context bridge entre Electron main e renderer.
 *
 * Expoe API segura (sem nodeIntegration) para o React renderer.
 * Operacoes simples via contextBridge; operacoes de streaming vao
 * direto via HTTP do renderer para o Core.
 */

import { contextBridge, ipcRenderer } from 'electron';

const api = {
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
};

contextBridge.exposeInMainWorld('kairos', api);
export type KairosApi = typeof api;
