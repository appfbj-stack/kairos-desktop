/**
 * Tipo da API exposta pelo preload (contextBridge).
 */

export interface KairosApi {
  chat: {
    send: (payload: unknown) => Promise<any>;
    cancel: (conversationId: string) => Promise<any>;
    history: (conversationId: string) => Promise<any>;
  };
  skills: {
    list: () => Promise<any>;
    install: (id: string) => Promise<any>;
    uninstall: (id: string) => Promise<any>;
    execute: (id: string, args: unknown) => Promise<any>;
  };
  memory: {
    recall: (query: string) => Promise<any>;
    store: (entity: unknown) => Promise<any>;
    search: (query: string) => Promise<any>;
  };
  llm: {
    listProviders: () => Promise<any>;
    listModels: (provider: string) => Promise<any>;
    setDefault: (provider: string, model: string) => Promise<any>;
  };
  system: {
    getSettings: () => Promise<any>;
    setSetting: (key: string, value: unknown) => Promise<any>;
  };
  on: (channel: string, listener: (...args: any[]) => void) => () => void;
}

declare global {
  interface Window {
    kairos: KairosApi;
  }
}

export {};
