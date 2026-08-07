/**
 * Use Case: Invoke LLM
 *
 * Recebe uma conversa e retorna a resposta do LLM em chunks (streaming).
 * Seleciona automaticamente o provider/model via LLM Router (com fallback).
 */

import type { InvokeChunk, ToolDefinition } from '../../infrastructure/llm/llm-provider.interface.js';
import { llmRouter } from '../../infrastructure/llm/router.js';
import type { ChatMessage } from '../../infrastructure/llm/llm-provider.interface.js';
import { ProviderError } from '../../domain/errors/domain.error.js';

export interface InvokeLLMInput {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  provider?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface InvokeLLMOutput {
  provider: string;
  model: string;
  stream: AsyncIterable<InvokeChunk>;
}

export class InvokeLLMUseCase {
  constructor(private router = llmRouter) {}

  async execute(input: InvokeLLMInput): Promise<InvokeLLMOutput> {
    const { provider, model } = await this.router.resolveWithFallback(input.provider, input.model);

    try {
      const stream = await provider.invoke({
        model,
        messages: input.messages,
        tools: input.tools,
        systemPrompt: input.systemPrompt,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        stream: true,
      });

      return { provider: provider.id, model, stream };
    } catch (err) {
      if (err instanceof ProviderError) {
        throw err;
      }
      throw new ProviderError(`Erro ao invocar ${provider.displayName}: ${(err as Error).message}`);
    }
  }
}

export const invokeLLMUseCase = new InvokeLLMUseCase();
