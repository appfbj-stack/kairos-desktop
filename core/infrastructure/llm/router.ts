/**
 * LLM Router
 *
 * Decide qual provider usar baseado em:
 *  - Config do usuario (system settings)
 *  - Default por provedor
 *  - Fallback chain se provider primário falhar
 */

import type { LLMProvider } from './llm-provider.interface.js';
import { openRouterAdapter } from './openrouter.adapter.js';
import { openAIAdapter } from './openai.adapter.js';
import { anthropicAdapter } from './anthropic.adapter.js';
import { ollamaAdapter } from './ollama.adapter.js';
import { ProviderError } from '../../domain/errors/domain.error.js';

export interface LLMRouterConfig {
  defaultProvider: string;
  defaultModel: string;
  fallbackChain: string[]; // provider IDs em ordem
}

export const DEFAULT_ROUTER_CONFIG: LLMRouterConfig = {
  defaultProvider: process.env.KAIROS_DEFAULT_PROVIDER || 'openrouter',
  defaultModel: process.env.KAIROS_DEFAULT_MODEL || 'openai/gpt-4o-mini',
  fallbackChain: ['openrouter', 'openai', 'ollama', 'anthropic'],
};

const PROVIDERS: Record<string, LLMProvider> = {
  openrouter: openRouterAdapter,
  openai: openAIAdapter,
  anthropic: anthropicAdapter,
  ollama: ollamaAdapter,
};

export class LLMRouter {
  constructor(private config: LLMRouterConfig = DEFAULT_ROUTER_CONFIG) {}

  /**
   * Retorna o provider padrao se nenhum for especificado.
   */
  getProvider(providerId?: string): LLMProvider {
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
  listProviders(): LLMProvider[] {
    return Object.values(PROVIDERS);
  }

  /**
   * Resolve provider + model com fallback automatico em caso de erro.
   */
  async resolveWithFallback(
    requestedProvider?: string,
    requestedModel?: string,
  ): Promise<{ provider: LLMProvider; model: string }> {
    const tried = new Set<string>();
    const providers = requestedProvider
      ? [requestedProvider, ...this.config.fallbackChain.filter((p) => p !== requestedProvider)]
      : [this.config.defaultProvider, ...this.config.fallbackChain.filter((p) => p !== this.config.defaultProvider)];

    for (const providerId of providers) {
      if (tried.has(providerId)) continue;
      tried.add(providerId);

      const provider = PROVIDERS[providerId];
      if (!provider) continue;

      try {
        // Verifica se a API key esta configurada
        this.assertApiKeyConfigured(providerId);
        return {
          provider,
          model: requestedModel || (providerId === this.config.defaultProvider ? this.config.defaultModel : 'openai/gpt-4o-mini'),
        };
      } catch {
        // tenta o proximo
        continue;
      }
    }

    throw new ProviderError(
      `Nenhum provider LLM configurado. Defina pelo menos uma: ${this.config.fallbackChain.map((p) => this.envVarFor(p)).join(', ')}`,
    );
  }

  private envVarFor(providerId: string): string {
    return {
      openrouter: 'OPENROUTER_API_KEY',
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      ollama: 'OLLAMA_BASE_URL (opcional)',
    }[providerId] || '?';
  }

  private assertApiKeyConfigured(providerId: string): void {
    const envVars: Record<string, string[]> = {
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
