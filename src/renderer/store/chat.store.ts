/**
 * Zustand store para chat state.
 * Usa Record<string, Conversation> (plain object) ao inves de Map
 * porque Maps nao sao shallow-compared pelo Zustand, causando
 * re-renders quebrados ou falha de atualizacao.
 */

import { create } from 'zustand';

export interface MessageAttachment {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUri?: string;
  extractedText?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  ts: number;
  streaming?: boolean;
  toolCalls?: Array<{ name: string; args: unknown }>;
  error?: string;
  attachments?: MessageAttachment[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ChatState {
  conversations: Record<string, Conversation>;
  conversationIds: string[]; // ordem de insercao
  activeId: string | null;
  isStreaming: boolean;

  setActive: (id: string | null) => void;
  newConversation: () => string;
  deleteConversation: (id: string) => void;
  addMessage: (conversationId: string, msg: Omit<ChatMessage, 'ts'>) => void;
  appendToMessage: (conversationId: string, messageId: string, chunk: string) => void;
  finalizeMessage: (conversationId: string, messageId: string) => void;
  setStreaming: (streaming: boolean) => void;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: {},
  conversationIds: [],
  activeId: null,
  isStreaming: false,

  setActive: (id) => set({ activeId: id }),

  newConversation: () => {
    const id = uuid();
    const now = Date.now();
    set((s) => ({
      conversations: { ...s.conversations, [id]: { id, title: 'Nova conversa', messages: [], createdAt: now, updatedAt: now } },
      conversationIds: [...s.conversationIds, id],
      activeId: id,
    }));
    return id;
  },

  deleteConversation: (id) =>
    set((s) => {
      const next = { ...s.conversations };
      delete next[id];
      return {
        conversations: next,
        conversationIds: s.conversationIds.filter((x) => x !== id),
        activeId: s.activeId === id ? null : s.activeId,
      };
    }),

  addMessage: (conversationId, msg) => {
    const ts = Date.now();
    set((s) => {
      const conv = s.conversations[conversationId];
      if (!conv) return s;
      return {
        conversations: {
          ...s.conversations,
          [conversationId]: { ...conv, messages: [...conv.messages, { ...msg, ts }], updatedAt: ts },
        },
      };
    });
  },

  appendToMessage: (conversationId, messageId, chunk) => {
    set((s) => {
      const conv = s.conversations[conversationId];
      if (!conv) return s;
      return {
        conversations: {
          ...s.conversations,
          [conversationId]: {
            ...conv,
            messages: conv.messages.map((m) => (m.id === messageId ? { ...m, content: m.content + chunk } : m)),
          },
        },
      };
    });
  },

  finalizeMessage: (conversationId, messageId) => {
    set((s) => {
      const conv = s.conversations[conversationId];
      if (!conv) return s;
      return {
        conversations: {
          ...s.conversations,
          [conversationId]: {
            ...conv,
            messages: conv.messages.map((m) => (m.id === messageId ? { ...m, streaming: false } : m)),
          },
        },
      };
    });
  },

  setStreaming: (streaming) => set({ isStreaming: streaming }),
}));
