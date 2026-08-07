/**
 * Use Case: Conversation management (Nivel Usuario)
 *
 * Cria, lista e adiciona mensagens em conversas.
 */

import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { getMemoryRepository, type Conversation, type Message } from '../../infrastructure/memory/sqlite.repository.js';

export const CreateConversationInputSchema = z.object({
  title: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export const AddMessageInputSchema = z.object({
  conversationId: z.string(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  toolCalls: z.array(z.unknown()).optional(),
  toolResults: z.array(z.unknown()).optional(),
  tokensIn: z.number().optional(),
  tokensOut: z.number().optional(),
  costUsd: z.number().optional(),
});

export class CreateConversationUseCase {
  async execute(input: z.infer<typeof CreateConversationInputSchema>): Promise<Conversation> {
    const parsed = CreateConversationInputSchema.parse(input);
    const repo = getMemoryRepository();
    return repo.createConversation({
      id: uuid(),
      title: parsed.title || null,
      provider: parsed.provider || null,
      model: parsed.model || null,
    });
  }
}

export class AddMessageUseCase {
  async execute(input: z.infer<typeof AddMessageInputSchema>): Promise<Message> {
    const parsed = AddMessageInputSchema.parse(input);
    const repo = getMemoryRepository();
    return repo.addMessage({
      id: uuid(),
      conversationId: parsed.conversationId,
      role: parsed.role,
      content: parsed.content,
      toolCalls: parsed.toolCalls || null,
      toolResults: parsed.toolResults || null,
      tokensIn: parsed.tokensIn || null,
      tokensOut: parsed.tokensOut || null,
      costUsd: parsed.costUsd || null,
    });
  }
}

export class ListConversationsUseCase {
  async execute(limit = 50): Promise<Conversation[]> {
    return getMemoryRepository().listConversations(limit);
  }
}

export class ListMessagesUseCase {
  async execute(conversationId: string, limit = 200): Promise<Message[]> {
    return getMemoryRepository().listMessages(conversationId, limit);
  }
}

export const createConversationUseCase = new CreateConversationUseCase();
export const addMessageUseCase = new AddMessageUseCase();
export const listConversationsUseCase = new ListConversationsUseCase();
export const listMessagesUseCase = new ListMessagesUseCase();
