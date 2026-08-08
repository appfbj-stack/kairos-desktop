/**
 * Registry central de handlers IPC.
 * Cada modulo de handler (chat, skills, etc.) expoe uma funcao `register(ipcMain)`.
 */

import { ipcMain } from 'electron';
import { registerChatHandlers } from './chat.handler.js';
import { registerSkillsHandlers } from './skills.handler.js';
import { registerMemoryHandlers } from './memory.handler.js';
import { registerApprovalHandlers } from './approvals.handler.js';
import { registerLlmHandlers } from './llm.handler.js';
import { registerSystemHandlers } from './system.handler.js';
import { registerUpdateHandlers } from './updates.handler.js';
import { registerAuditHandlers } from './audit.handler.js';
import { registerUploadHandlers } from './upload.handler.js';

export function registerIpcHandlers(): void {
  registerChatHandlers(ipcMain);
  registerSkillsHandlers(ipcMain);
  registerMemoryHandlers(ipcMain);
  registerApprovalHandlers(ipcMain);
  registerLlmHandlers(ipcMain);
  registerSystemHandlers(ipcMain);
  registerUpdateHandlers(ipcMain);
  registerAuditHandlers(ipcMain);
  registerUploadHandlers(ipcMain);
}
