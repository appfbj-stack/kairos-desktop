/**
 * Anthropic native adapter.
 *
 * Endpoint: https://api.anthropic.com/v1
 * API: https://docs.anthropic.com/en/api/messages
 * NOT compatible with OpenAI - has its own /v1/messages format.
 *
 * Por enquanto exporta apenas o esqueleto. Implementacao completa na Fase 1.1.
 * OpenRouter ja da acesso ao Claude com 1 chave - usar enquanto isso.
 */

import type { LLMProvider, ModelInfo } from './llm-provider.interface.js';
import { ProviderError } from '../../domain/errors/domain.error.js';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const API_VERSION = '2023-06-01';

export const anthropicAdapter: LLMProvider = {
  id: 'anthropic',
  displayName: 'Anthropic',

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet', provider: 'anthropic', contextWindow: 200_000, supportsTools: true, supportsVision: true, inputCostPerMTokens: 3, outputCostPerMTokens: 15 },
      { id: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', provider: 'anthropic', contextWindow: 200_000, supportsTools: true, supportsVision: true, inputCostPerMTokens: 0.8, outputCostPerMTokens: 4 },
      { id: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus', provider: 'anthropic', contextWindow: 200_000, supportsTools: true, supportsVision: true, inputCostPerMTokens: 15, outputCostPerMTokens: 75 },
    ];
  },

  async invoke(_request): Promise<AsyncIterable<never>> {
    // Implementacao real na Fase 1.1
    // Por enquanto, instruir o usuario a usar OpenRouter para Claude
    throw new ProviderError(
      'Anthropic native adapter ainda nao implementado. Use OpenRouter (openrouter.ai) com chave OPENROUTER_API_KEY para acessar Claude.',
    );
  },

  estimateCost(model, inputTokens, outputTokens): Promise<number> {
    const rates: Record<string, { in: number; out: number }> = {
      'claude-3-5-sonnet-20241022': { in: 3, out: 15 },
      'claude-3-5-haiku-20241022': { in: 0.8, out: 4 },
      'claude-3-opus-20240229': { in: 15, out: 75 },
    };
    const r = rates[model];
    if (!r) return Promise.resolve(0);
    return Promise.resolve(
      (inputTokens / 1_000_000) * r.in + (outputTokens / 1_000_000) * r.out,
    );
  },
};

// Manter variavel para implementacao futura
void API_VERSION;
void ANTHROPIC_BASE_URL;
