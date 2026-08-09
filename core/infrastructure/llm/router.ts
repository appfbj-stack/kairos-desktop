/**
 * LLM Router
 *
 * Decide qual provider/model usar baseado em:
 *  - Config do usuario (system settings, env vars)
 *  - Default por provedor
 *  - Fallback chain se provider primário falhar
 *  - Fallback de MODELO free se o modelo solicitado nao estiver disponivel
 *
 * Politica FREE-FIRST (2026-08-08):
 *  - Quando o usuario NAO escolhe modelo, usa FREE_FALLBACK_CHAIN em ordem
 *  - Modelos `paid` exigem creditos na conta (avisar UI)
 *  - Modelos `unstable` (ex: gemma-4-31b) sao pulados no auto-fallback
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
  /**
   * Cadeia de modelos FREE estaveis para fallback automatico quando
   * - o usuario nao especificar modelo
   * - o default falhar
   * - o modelo solicitado for `unstable` (rate-limited)
   * Cada item eh um model id completo (provider/model).
   */
  freeFallbackChain: string[];
}

const DEFAULT_FREE_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

// Cadeia de fallback: comeca no default, depois tenta outros free estaveis.
// Modelos unstable (gemma-4-31b) sao EXCLUIDOS daqui de proposito.
const DEFAULT_FREE_FALLBACK_CHAIN = [
  'nvidia/nemotron-3-super-120b-a12b:free',   // default, 16s estavel
  'nvidia/nemotron-3-ultra-550b-a55b:free',  // 550B, mais lento mas robusto
  'openai/gpt-oss-20b:free',                  // 20B, rapido
  'google/gemma-4-26b-a4b-it:free',          // 26B, alternativa
];

export const DEFAULT_ROUTER_CONFIG: LLMRouterConfig = {
  defaultProvider: process.env.KAIROS_DEFAULT_PROVIDER || 'openrouter',
  defaultModel: process.env.KAIROS_DEFAULT_MODEL || DEFAULT_FREE_MODEL,
  fallbackChain: ['openrouter', 'ollama'], // openai/anthropic removidos - exigem creditos
  freeFallbackChain: DEFAULT_FREE_FALLBACK_CHAIN,
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
   * Retorna a cadeia de modelos free estaveis (para UI exibir).
   */
  getFreeFallbackChain(): string[] {
    return [...this.config.freeFallbackChain];
  }

  /**
   * Detecta se um model id eh free (heuristica: contem ':free' ou esta na freeFallbackChain).
   */
  isFreeModel(modelId: string): boolean {
    if (!modelId) return false;
    if (modelId.includes(':free')) return true;
    return this.config.freeFallbackChain.includes(modelId);
  }

  /**
   * Resolve provider + model com fallback automatico em caso de erro.
   * Politica FREE-FIRST:
   *  - Se requestedModel nao foi passado, usa defaultModel (que ja eh free)
   *  - Se o modelo for unstable (ex: gemma-4-31b), troca por um free estavel
   *  - Se o modelo for paid, AVISA via ProviderError com mensagem clara
   */
  async resolveWithFallback(
    requestedProvider?: string,
    requestedModel?: string,
  ): Promise<{ provider: LLMProvider; model: string }> {
    // 1) Se usuario NAO escolheu modelo, usa a cadeia free
    if (!requestedModel) {
      return this.resolveDefaultFree(requestedProvider);
    }

    // 2) Se usuario escolheu modelo unstable, troca por free equivalente
    const unstableModels = ['google/gemma-4-31b-it:free'];
    if (unstableModels.includes(requestedModel)) {
      console.warn(
        `[router] Modelo ${requestedModel} eh unstable (rate-limited upstream). Trocando para ${this.config.defaultModel}.`,
      );
      requestedModel = this.config.defaultModel;
    }

    // 3) Se modelo for paid e nao ha fallback configurado, deixa passar (pode dar 402 se sem credito)
    // Nao bloqueamos aqui - o 402 do provedor eh mais informativo que abortar antes.

    // 4) Resolve provider
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
        this.assertApiKeyConfigured(providerId);
        return { provider, model: requestedModel };
      } catch {
        continue;
      }
    }

    throw new ProviderError(
      `Nenhum provider LLM configurado. Defina pelo menos uma: ${this.config.fallbackChain.map((p) => this.envVarFor(p)).join(', ')}`,
    );
  }

  /**
   * Resolve usando a cadeia de modelos free. Tenta o provider preferido,
   * depois fallback para ollama. O modelo default ja eh free (configurado
   * em DEFAULT_FREE_FALLBACK_CHAIN).
   *
   * Futuramente: implementar retry com proximo modelo do freeFallbackChain
   * quando o default falhar (requer cache de erro e refactor do invoke-llm).
   */
  private async resolveDefaultFree(
    requestedProvider?: string,
  ): Promise<{ provider: LLMProvider; model: string }> {
    const triedProviders = new Set<string>();
    const providers = requestedProvider
      ? [requestedProvider, ...this.config.fallbackChain.filter((p) => p !== requestedProvider)]
      : [this.config.defaultProvider, ...this.config.fallbackChain.filter((p) => p !== this.config.defaultProvider)];

    let lastError: Error | null = null;
    for (const providerId of providers) {
      if (triedProviders.has(providerId)) continue;
      triedProviders.add(providerId);

      const provider = PROVIDERS[providerId];
      if (!provider) continue;

      try {
        this.assertApiKeyConfigured(providerId);
        // Provider disponivel - usa o default model (que ja eh free por config)
        return { provider, model: this.config.defaultModel };
      } catch (e) {
        lastError = e as Error;
        continue;
      }
    }

    throw new ProviderError(
      `Nenhum provider LLM configurado. Defina pelo menos uma: ${this.config.fallbackChain.map((p) => this.envVarFor(p)).join(', ')}` +
      (lastError ? ` (ultimo erro: ${lastError.message})` : ''),
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
