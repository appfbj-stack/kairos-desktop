/**
 * OpenRouter Adapter
 *
 * OpenRouter = 1 chave, 200+ modelos (OpenAI, Anthropic, Google, Meta, Mistral...)
 * Endpoint: https://openrouter.ai/api/v1
 * Compatível com OpenAI Chat Completions API
 *
 * Docs: https://openrouter.ai/docs
 */

import { createOpenAICompatibleAdapter } from './openai-compatible.adapter.js';
import type { LLMProvider } from './llm-provider.interface.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export const openRouterAdapter: LLMProvider = createOpenAICompatibleAdapter({
  id: 'openrouter',
  displayName: 'OpenRouter',
  baseUrl: OPENROUTER_BASE_URL,
  apiKeyEnvVar: 'OPENROUTER_API_KEY',
  // OpenRouter models catalog
  // https://openrouter.ai/models
  models: [
    // OpenAI
    { id: 'openai/gpt-4o', displayName: 'OpenAI GPT-4o', contextWindow: 128_000, supportsTools: true, supportsVision: true, inputCostPerMTokens: 2.5, outputCostPerMTokens: 10 },
    { id: 'openai/gpt-4o-mini', displayName: 'OpenAI GPT-4o mini', contextWindow: 128_000, supportsTools: true, supportsVision: true, inputCostPerMTokens: 0.15, outputCostPerMTokens: 0.6 },
    { id: 'openai/gpt-4-turbo', displayName: 'OpenAI GPT-4 Turbo', contextWindow: 128_000, supportsTools: true, supportsVision: true, inputCostPerMTokens: 10, outputCostPerMTokens: 30 },
    { id: 'openai/o1-preview', displayName: 'OpenAI o1-preview', contextWindow: 128_000, supportsTools: false, supportsVision: false, inputCostPerMTokens: 15, outputCostPerMTokens: 60 },
    { id: 'openai/o1-mini', displayName: 'OpenAI o1-mini', contextWindow: 128_000, supportsTools: false, supportsVision: false, inputCostPerMTokens: 3, outputCostPerMTokens: 12 },
    // Anthropic
    { id: 'anthropic/claude-3.5-sonnet', displayName: 'Anthropic Claude 3.5 Sonnet', contextWindow: 200_000, supportsTools: true, supportsVision: true, inputCostPerMTokens: 3, outputCostPerMTokens: 15 },
    { id: 'anthropic/claude-3.5-haiku', displayName: 'Anthropic Claude 3.5 Haiku', contextWindow: 200_000, supportsTools: true, supportsVision: true, inputCostPerMTokens: 0.8, outputCostPerMTokens: 4 },
    { id: 'anthropic/claude-3-opus', displayName: 'Anthropic Claude 3 Opus', contextWindow: 200_000, supportsTools: true, supportsVision: true, inputCostPerMTokens: 15, outputCostPerMTokens: 75 },
    // Google
    { id: 'google/gemini-pro-1.5', displayName: 'Google Gemini Pro 1.5', contextWindow: 2_000_000, supportsTools: true, supportsVision: true, inputCostPerMTokens: 1.25, outputCostPerMTokens: 5 },
    { id: 'google/gemini-flash-1.5', displayName: 'Google Gemini Flash 1.5', contextWindow: 1_000_000, supportsTools: true, supportsVision: true, inputCostPerMTokens: 0.075, outputCostPerMTokens: 0.3 },
    // Meta
    { id: 'meta-llama/llama-3.1-405b-instruct', displayName: 'Meta Llama 3.1 405B', contextWindow: 131_072, supportsTools: true, supportsVision: false, inputCostPerMTokens: 2, outputCostPerMTokens: 2 },
    { id: 'meta-llama/llama-3.1-70b-instruct', displayName: 'Meta Llama 3.1 70B', contextWindow: 131_072, supportsTools: true, supportsVision: false, inputCostPerMTokens: 0.59, outputCostPerMTokens: 0.79 },
    // Mistral
    { id: 'mistralai/mistral-large', displayName: 'Mistral Large', contextWindow: 128_000, supportsTools: true, supportsVision: false, inputCostPerMTokens: 2, outputCostPerMTokens: 6 },
    // Free tier (atualizado em 2026-08-07)
    { id: 'openai/gpt-oss-20b:free', displayName: 'OpenAI gpt-oss-20B (free)', contextWindow: 131_072, supportsTools: true, supportsVision: false, inputCostPerMTokens: 0, outputCostPerMTokens: 0, tier: 'free' },
    // gemma-4-31b marca como unstable - OpenRouter reportou 429 frequente upstream
    // (shared pool do Google AI Studio). Deixa disponivel mas nao usa por default.
    { id: 'google/gemma-4-31b-it:free', displayName: 'Google Gemma 4 31B (free, unstable)', contextWindow: 262_144, supportsTools: true, supportsVision: false, inputCostPerMTokens: 0, outputCostPerMTokens: 0, tier: 'unstable' },
    { id: 'google/gemma-4-26b-a4b-it:free', displayName: 'Google Gemma 4 26B (free)', contextWindow: 262_144, supportsTools: true, supportsVision: false, inputCostPerMTokens: 0, outputCostPerMTokens: 0, tier: 'free' },
    { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', displayName: 'NVIDIA Nemotron-3 550B (free)', contextWindow: 1_000_000, supportsTools: true, supportsVision: false, inputCostPerMTokens: 0, outputCostPerMTokens: 0, tier: 'free' },
    // Default - rapido (~16s), estavel, suporta tools
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', displayName: 'NVIDIA Nemotron-3 120B (free, default)', contextWindow: 262_144, supportsTools: true, supportsVision: false, inputCostPerMTokens: 0, outputCostPerMTokens: 0, tier: 'free' },
  ],
});
