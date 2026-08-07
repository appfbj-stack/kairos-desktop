/**
 * Zustand store para chat state.
 */

import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  ts: number;
  streaming?: boolean;
  toolCalls?: Array<{ name: string; args: unknown }>;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ChatState {
  conversations: Map<string, Conversation>;
  activeId: string | null;
  sidebarOpen: boolean;
  isStreaming: boolean;

  setActive: (id: string | null) => void;
  toggleSidebar: () => void;
  newConversation: () => string;
  deleteConversation: (id: string) => void;
  addMessage: (conversationId: string, msg: Omit<ChatMessage, 'ts'>) => void;
  appendToMessage: (conversationId: string, messageId: string, chunk: string) => void;
  finalizeMessage: (conversationId: string, messageId: string) => void;
  setStreaming: (streaming: boolean) => void;
}

function uuid(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: new Map(),
  activeId: null,
  sidebarOpen: true,
  isStreaming: false,

  setActive: (id) => set({ activeId: id }),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  newConversation: () => {
    const id = uuid();
    const now = Date.now();
    set((s) => {
      const next = new Map(s.conversations);
      next.set(id, { id, title: 'Nova conversa', messages: [], createdAt: now, updatedAt: now });
      return { conversations: next, activeId: id };
    });
    return id;
  },

  deleteConversation: (id) =>
    set((s) => {
      const next = new Map(s.conversations);
      next.delete(id);
      return {
        conversations: next,
        activeId: s.activeId === id ? null : s.activeId,
      };
    }),

  addMessage: (conversationId, msg) => {
    const ts = Date.now();
    set((s) => {
      const conv = s.conversations.get(conversationId);
      if (!conv) return s;
      const next = new Map(s.conversations);
      next.set(conversationId, {
        ...conv,
        messages: [...conv.messages, { ...msg, ts }],
        updatedAt: ts,
      });
      return { conversations: next };
    });
  },

  appendToMessage: (conversationId, messageId, chunk) => {
    set((s) => {
      const conv = s.conversations.get(conversationId);
      if (!conv) return s;
      const next = new Map(s.conversations);
      const messages = conv.messages.map((m) =>
        m.id === messageId ? { ...m, content: m.content + chunk } : m,
      );
      next.set(conversationId, { ...conv, messages });
      return { conversations: next };
    });
  },

  finalizeMessage: (conversationId, messageId) => {
    set((s) => {
      const conv = s.conversations.get(conversationId);
      if (!conv) return s;
      const next = new Map(s.conversations);
      const messages = conv.messages.map((m) =>
        m.id === messageId ? { ...m, streaming: false } : m,
      );
      next.set(conversationId, { ...conv, messages });
      return { conversations: next };
    });
  },

  setStreaming: (streaming) => set({ isStreaming: streaming }),
}));

void get;
