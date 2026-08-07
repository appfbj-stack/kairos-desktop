/**
 * Use Case: Invoke LLM
 *
 * Recebe uma conversa e retorna a resposta do LLM em chunks (streaming).
 * Seleciona automaticamente o provider/model via LLM Router (com fallback).
 */
import { llmRouter } from '../../infrastructure/llm/router.js';
import { ProviderError } from '../../domain/errors/domain.error.js';
export class InvokeLLMUseCase {
    router;
    constructor(router = llmRouter) {
        this.router = router;
    }
    async execute(input) {
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
        }
        catch (err) {
            if (err instanceof ProviderError) {
                throw err;
            }
            throw new ProviderError(`Erro ao invocar ${provider.displayName}: ${err.message}`);
        }
    }
}
export const invokeLLMUseCase = new InvokeLLMUseCase();
