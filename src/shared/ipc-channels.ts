/**
 * IPC Channels — Constantes de canais IPC main <-> renderer.
 * Centralizado para evitar typos e permitir refactor seguro.
 */

export const IPC = {
  // Chat
  CHAT_SEND: 'chat:send',
  CHAT_STREAM: 'chat:stream',
  CHAT_CANCEL: 'chat:cancel',
  CHAT_HISTORY: 'chat:history',

  // Skills
  SKILLS_LIST: 'skills:list',
  SKILLS_INSTALL: 'skills:install',
  SKILLS_UNINSTALL: 'skills:uninstall',
  SKILLS_EXECUTE: 'skills:execute',
  SKILLS_CREATE: 'skills:create',

  // Upload
  UPLOAD_FILE: 'upload:file',
  UPLOAD_PICK: 'upload:pick',

  // Memory
  MEMORY_RECALL: 'memory:recall',
  MEMORY_STORE: 'memory:store',
  MEMORY_SEARCH: 'memory:search',
  MEMORY_EXPORT: 'memory:export',
  MEMORY_DELETE_ALL: 'memory:delete-all',

  // Approvals
  APPROVAL_REQUEST: 'approval:request',
  APPROVAL_RESPOND: 'approval:respond',
  APPROVAL_LIST_PENDING: 'approval:list-pending',

  // LLM
  LLM_LIST_PROVIDERS: 'llm:list-providers',
  LLM_LIST_MODELS: 'llm:list-models',
  LLM_SET_DEFAULT: 'llm:set-default',

  // System
  SYSTEM_GET_SETTINGS: 'system:get-settings',
  SYSTEM_SET_SETTING: 'system:set-setting',
  SYSTEM_OPEN_EXTERNAL: 'system:open-external',
  SYSTEM_QUIT: 'system:quit',

  // Updates
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',

  // Audit
  AUDIT_LIST: 'audit:list',
  AUDIT_EXPORT: 'audit:export',

  // Events (main -> renderer)
  EVT_CHAT_CHUNK: 'evt:chat-chunk',
  EVT_CHAT_TOOL_CALL: 'evt:chat-tool-call',
  EVT_SKILL_STATUS: 'evt:skill-status',
  EVT_APPROVAL_REQUESTED: 'evt:approval-requested',
  EVT_MEMORY_UPDATED: 'evt:memory-updated',
  EVT_UPDATE_AVAILABLE: 'evt:update-available',
  EVT_UPDATE_PROGRESS: 'evt:update-progress',
  EVT_ERROR: 'evt:error',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
