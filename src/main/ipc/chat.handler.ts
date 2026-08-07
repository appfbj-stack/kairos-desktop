/**
 * IPC Handlers - Chat
 * Ponte entre renderer (React) e Kairos AI Core.
 */

import type { IpcMain } from 'electron';
import { IPC } from '../../shared/ipc-channels.js';
import { logger } from '../services/logger.js';

export function registerChatHandlers(ipc: IpcMain): void {
  ipc.handle(IPC.CHAT_SEND, async (_event, payload) => {
    logger.info({ payload }, 'CHAT_SEND received');
    // TODO (Fase 3): chamar Core SendMessageUseCase
    throw new Error('Not implemented yet - Fase 3');
  });

  ipc.handle(IPC.CHAT_CANCEL, async (_event, conversationId: string) => {
    logger.info({ conversationId }, 'CHAT_CANCEL received');
    // TODO (Fase 3): cancelar stream ativo
    throw new Error('Not implemented yet - Fase 3');
  });

  ipc.handle(IPC.CHAT_HISTORY, async (_event, conversationId: string) => {
    logger.info({ conversationId }, 'CHAT_HISTORY received');
    // TODO (Fase 2): ler do SQLite
    throw new Error('Not implemented yet - Fase 2');
  });
}
