/**
 * Preload script - context bridge entre Electron main e renderer.
 * Expoe API segura (sem nodeIntegration) para o React.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels.js';

const api = {
  // Chat
  chat: {
    send: (payload: unknown) => ipcRenderer.invoke(IPC.CHAT_SEND, payload),
    cancel: (conversationId: string) => ipcRenderer.invoke(IPC.CHAT_CANCEL, conversationId),
    history: (conversationId: string) => ipcRenderer.invoke(IPC.CHAT_HISTORY, conversationId),
  },

  // Skills
  skills: {
    list: () => ipcRenderer.invoke(IPC.SKILLS_LIST),
    install: (id: string) => ipcRenderer.invoke(IPC.SKILLS_INSTALL, id),
    uninstall: (id: string) => ipcRenderer.invoke(IPC.SKILLS_UNINSTALL, id),
    execute: (id: string, args: unknown) => ipcRenderer.invoke(IPC.SKILLS_EXECUTE, id, args),
  },

  // Memory
  memory: {
    recall: (query: string) => ipcRenderer.invoke(IPC.MEMORY_RECALL, query),
    store: (entity: unknown) => ipcRenderer.invoke(IPC.MEMORY_STORE, entity),
    search: (query: string) => ipcRenderer.invoke(IPC.MEMORY_SEARCH, query),
  },

  // LLM
  llm: {
    listProviders: () => ipcRenderer.invoke(IPC.LLM_LIST_PROVIDERS),
    listModels: (provider: string) => ipcRenderer.invoke(IPC.LLM_LIST_MODELS, provider),
    setDefault: (provider: string, model: string) =>
      ipcRenderer.invoke(IPC.LLM_SET_DEFAULT, provider, model),
  },

  // System
  system: {
    getSettings: () => ipcRenderer.invoke(IPC.SYSTEM_GET_SETTINGS),
    setSetting: (key: string, value: unknown) =>
      ipcRenderer.invoke(IPC.SYSTEM_SET_SETTING, key, value),
    quit: () => ipcRenderer.invoke(IPC.SYSTEM_QUIT),
  },

  // Events (main -> renderer)
  on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => {
    const allowed = [
      IPC.EVT_CHAT_CHUNK,
      IPC.EVT_CHAT_TOOL_CALL,
      IPC.EVT_SKILL_STATUS,
      IPC.EVT_APPROVAL_REQUESTED,
      IPC.EVT_MEMORY_UPDATED,
      IPC.EVT_UPDATE_AVAILABLE,
      IPC.EVT_UPDATE_PROGRESS,
      IPC.EVT_ERROR,
    ];
    if (!allowed.includes(channel as never)) {
      throw new Error(`Channel not allowed: ${channel}`);
    }
    const wrapped = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      listener(_event, ...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
};

contextBridge.exposeInMainWorld('kairos', api);

export type KairosApi = typeof api;
