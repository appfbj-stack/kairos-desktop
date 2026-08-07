/**
 * Use Case: List available LLM providers and models.
 */

import { llmRouter } from '../../infrastructure/llm/router.js';
import type { ModelInfo } from '../../infrastructure/llm/llm-provider.interface.js';

export interface ProviderInfo {
  id: string;
  displayName: string;
  isConfigured: boolean;
  models: ModelInfo[];
}

export class ListProvidersUseCase {
  constructor(private router = llmRouter) {}

  async execute(): Promise<ProviderInfo[]> {
    const providers = this.router.listProviders();
    const results: ProviderInfo[] = [];

    for (const p of providers) {
      const envVar = this.envVarFor(p.id);
      const isConfigured = !envVar || !!process.env[envVar];

      let models: ModelInfo[] = [];
      try {
        models = await p.listModels();
      } catch {
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

  private envVarFor(providerId: string): string | null {
    return {
      openrouter: 'OPENROUTER_API_KEY',
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      ollama: null,
    }[providerId] ?? null;
  }
}

export const listProvidersUseCase = new ListProvidersUseCase();
