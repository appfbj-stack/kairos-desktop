/**
 * Use Case: List available LLM providers and models.
 */
import { llmRouter } from '../../infrastructure/llm/router.js';
export class ListProvidersUseCase {
    router;
    constructor(router = llmRouter) {
        this.router = router;
    }
    async execute() {
        const providers = this.router.listProviders();
        const results = [];
        for (const p of providers) {
            const envVar = this.envVarFor(p.id);
            const isConfigured = !envVar || !!process.env[envVar];
            let models = [];
            try {
                models = await p.listModels();
            }
            catch {
                // se falhar, retorna lista hardcoded
                models = [];
            }
            results.push({
                id: p.id,
                displayName: p.displayName,
                isConfigured,
                models,
            });
        }
        return results;
    }
    envVarFor(providerId) {
        return {
            openrouter: 'OPENROUTER_API_KEY',
            openai: 'OPENAI_API_KEY',
            anthropic: 'ANTHROPIC_API_KEY',
            ollama: null,
        }[providerId] ?? null;
    }
}
export const listProvidersUseCase = new ListProvidersUseCase();
