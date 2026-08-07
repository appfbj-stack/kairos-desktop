/**
 * IPC Handlers - Chat
 * Ponte entre renderer (React) e Kairos AI Core.
 */

import type { IpcMain } from 'electron';
import { IPC } from '../../shared/ipc-channels.js';
import { logger } from '../services/logger.js';
import { kairosCore } from '../services/core-bridge.js';

export function registerChatHandlers(ipc: IpcMain): void {
  ipc.handle(IPC.CHAT_SEND, async (event, payload) => {
    logger.info({ payload }, 'CHAT_SEND received');
    return kairosCore.chatSync(payload);
  });

  ipc.handle(IPC.CHAT_CANCEL, async (_event, conversationId: string) => {
    logger.info({ conversationId }, 'CHAT_CANCEL received');
    return kairosCore.cancelChat(conversationId);
  });

  ipc.handle(IPC.CHAT_HISTORY, async (_event, conversationId: string) => {
    logger.info({ conversationId }, 'CHAT_HISTORY received');
    return kairosCore.getHistory(conversationId);
  });
}
