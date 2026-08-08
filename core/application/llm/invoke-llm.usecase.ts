/**
 * Use Case: Invoke LLM
 *
 * Recebe uma conversa e retorna a resposta do LLM em chunks (streaming).
 * Seleciona automaticamente o provider/model via LLM Router (com fallback).
 *
 * Phase 4: suporta function calling via tool loop. Quando tools sao fornecidas,
 * o LLM pode retornar tool_calls; o use case executa as skills e re-invoca
 * o LLM ate obter resposta final (sem mais tool_calls).
 */

import type {
  InvokeChunk,
  ToolDefinition,
  ToolCall,
  ChatMessage,
} from '../../infrastructure/llm/llm-provider.interface.js';
import { llmRouter } from '../../infrastructure/llm/router.js';
import { ProviderError } from '../../domain/errors/domain.error.js';
import { skillRegistry } from '../../skills/registry.js';

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

  /**
   * Invocacao simples (sem tool loop) - mantem compatibilidade.
   */
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
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(`Erro ao invocar ${provider.displayName}: ${(err as Error).message}`);
    }
  }

  /**
   * Invocacao com tool loop: executa skills quando o LLM retorna tool_calls,
   * adiciona os resultados e re-invoca ate resposta final.
   *
   * Retorna um stream que emite:
   *  - { type: 'tool_call', toolCall: {...} } para cada tool que o LLM invocou
   *  - { type: 'tool_result', toolCallId, name, content } para cada resultado
   *  - { type: 'content', content: '...' } para o texto final do LLM
   *  - { type: 'done', usage, toolCalls } no final (com lista de todas as tools chamadas)
   *
   * Limite: max 5 iteracoes do loop (evita loop infinito).
   */
  async *executeWithTools(
    input: InvokeLLMInput,
  ): AsyncGenerator<InvokeChunk, void, void> {
    const MAX_ITERATIONS = 5;
    const { provider, model } = await this.router.resolveWithFallback(input.provider, input.model);

    // Mensagens mutaveis (vamos adicionar tool messages a cada iteracao)
    let messages: ChatMessage[] = [...input.messages];
    const allToolCalls: Array<{ name: string; args: Record<string, unknown>; result: string; ok: boolean }> = [];

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      let responseContent = '';
      let toolCalls: ToolCall[] = [];

      try {
        const stream = await provider.invoke({
          model,
          messages,
          tools: input.tools,
          systemPrompt: input.systemPrompt,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
          stream: true,
        });

        for await (const chunk of stream) {
          if (chunk.type === 'content' && chunk.content) {
            responseContent += chunk.content;
          } else if (chunk.type === 'tool_call' && chunk.toolCall) {
            toolCalls.push(chunk.toolCall);
          } else if (chunk.type === 'error') {
            yield { type: 'error', error: chunk.error || 'Erro desconhecido' };
            return;
          }
        }
      } catch (err) {
        yield { type: 'error', error: (err as Error).message };
        return;
      }

      // Se nao tem tool calls, eh a resposta final - emite e sai
      if (toolCalls.length === 0) {
        if (responseContent) {
          yield { type: 'content', content: responseContent };
        }
        yield { type: 'done', toolCalls: allToolCalls } as any;
        return;
      }

      // Tem tool calls - adiciona assistant message e executa cada tool
      messages.push({
        role: 'assistant',
        content: responseContent,
        toolCalls,
      });

      for (const tc of toolCalls) {
        // Notifica o renderer que estamos chamando a tool
        yield { type: 'tool_call', toolCall: tc };

        // Executa a skill
        const result = await skillRegistry.execute(tc.name, tc.arguments);
        const toolResultText = result.ok === true
          ? (result as { content: string }).content
          : `Erro: ${(result as { error: string }).error}`;

        // Salva no historico (para enviar de volta pro LLM)
        allToolCalls.push({
          name: tc.name,
          args: tc.arguments,
          result: toolResultText,
          ok: result.ok,
        });

        // Adiciona tool message na conversa (LLM precisa disso na proxima iter)
        messages.push({
          role: 'tool',
          content: toolResultText,
          toolCallId: tc.id,
          name: tc.name,
        });

        // Notifica o renderer do resultado
        yield {
          type: 'tool_result',
          content: toolResultText,
          toolResult: { name: tc.name, content: toolResultText, ok: result.ok },
        } as any;
      }
    }

    // Atingiu max iterations - emite o que acumulou
    yield {
      type: 'error',
      error: `Atingiu limite de ${MAX_ITERATIONS} iteracoes do tool loop`,
    };
  }
}

export const invokeLLMUseCase = new InvokeLLMUseCase();
