/**
 * LLM Router
 *
 * Decide qual provider usar baseado em:
 *  - Config do usuario (system settings)
 *  - Default por provedor
 *  - Fallback chain se provider primário falhar
 */
import { openRouterAdapter } from './openrouter.adapter.js';
import { openAIAdapter } from './openai.adapter.js';
import { anthropicAdapter } from './anthropic.adapter.js';
import { ollamaAdapter } from './ollama.adapter.js';
import { ProviderError } from '../../domain/errors/domain.error.js';
export const DEFAULT_ROUTER_CONFIG = {
    defaultProvider: process.env.KAIROS_DEFAULT_PROVIDER || 'openrouter',
    defaultModel: process.env.KAIROS_DEFAULT_MODEL || 'openai/gpt-oss-20b:free',
    fallbackChain: ['openrouter', 'ollama', 'openai', 'anthropic'],
};
const PROVIDERS = {
    openrouter: openRouterAdapter,
    openai: openAIAdapter,
    anthropic: anthropicAdapter,
    ollama: ollamaAdapter,
};
export class LLMRouter {
    config;
    constructor(config = DEFAULT_ROUTER_CONFIG) {
        this.config = config;
    }
    /**
     * Retorna o provider padrao se nenhum for especificado.
     */
    getProvider(providerId) {
        const id = providerId || this.config.defaultProvider;
        const provider = PROVIDERS[id];
        if (!provider) {
            throw new ProviderError(`Provider nao encontrado: ${id}. Disponiveis: ${Object.keys(PROVIDERS).join(', ')}`);
        }
        return provider;
    }
    /**
     * Lista todos os providers registrados.
     */
    listProviders() {
        return Object.values(PROVIDERS);
    }
    /**
     * Resolve provider + model com fallback automatico em caso de erro.
     */
    async resolveWithFallback(requestedProvider, requestedModel) {
        const tried = new Set();
        const providers = requestedProvider
            ? [requestedProvider, ...this.config.fallbackChain.filter((p) => p !== requestedProvider)]
            : [this.config.defaultProvider, ...this.config.fallbackChain.filter((p) => p !== this.config.defaultProvider)];
        for (const providerId of providers) {
            if (tried.has(providerId))
                continue;
            tried.add(providerId);
            const provider = PROVIDERS[providerId];
            if (!provider)
                continue;
            try {
                // Verifica se a API key esta configurada
                this.assertApiKeyConfigured(providerId);
                return {
                    provider,
                    model: requestedModel || (providerId === this.config.defaultProvider ? this.config.defaultModel : 'openai/gpt-4o-mini'),
                };
            }
            catch {
                // tenta o proximo
                continue;
            }
        }
        throw new ProviderError(`Nenhum provider LLM configurado. Defina pelo menos uma: ${this.config.fallbackChain.map((p) => this.envVarFor(p)).join(', ')}`);
    }
    envVarFor(providerId) {
        return {
            openrouter: 'OPENROUTER_API_KEY',
            openai: 'OPENAI_API_KEY',
            anthropic: 'ANTHROPIC_API_KEY',
            ollama: 'OLLAMA_BASE_URL (opcional)',
        }[providerId] || '?';
    }
    assertApiKeyConfigured(providerId) {
        const envVars = {
            openrouter: ['OPENROUTER_API_KEY'],
            openai: ['OPENAI_API_KEY'],
            anthropic: ['ANTHROPIC_API_KEY'],
            ollama: [], // nao exige
        };
        const required = envVars[providerId] || [];
        for (const v of required) {
            if (!process.env[v]) {
                throw new ProviderError(`${v} nao configurado`);
            }
        }
    }
}
export const llmRouter = new LLMRouter();
