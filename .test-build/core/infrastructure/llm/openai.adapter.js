/**
 * OpenAI native adapter.
 *
 * Endpoint: https://api.openai.com/v1
 * Docs: https://platform.openai.com/docs/api-reference/chat
 */
import { createOpenAICompatibleAdapter } from './openai-compatible.adapter.js';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const openAIAdapter = createOpenAICompatibleAdapter({
    id: 'openai',
    displayName: 'OpenAI',
    baseUrl: OPENAI_BASE_URL,
    apiKeyEnvVar: 'OPENAI_API_KEY',
    models: [
        { id: 'gpt-4o', displayName: 'GPT-4o', contextWindow: 128_000, supportsTools: true, supportsVision: true, inputCostPerMTokens: 2.5, outputCostPerMTokens: 10 },
        { id: 'gpt-4o-mini', displayName: 'GPT-4o mini', contextWindow: 128_000, supportsTools: true, supportsVision: true, inputCostPerMTokens: 0.15, outputCostPerMTokens: 0.6 },
        { id: 'gpt-4-turbo', displayName: 'GPT-4 Turbo', contextWindow: 128_000, supportsTools: true, supportsVision: true, inputCostPerMTokens: 10, outputCostPerMTokens: 30 },
        { id: 'o1-preview', displayName: 'o1-preview', contextWindow: 128_000, supportsTools: false, supportsVision: false, inputCostPerMTokens: 15, outputCostPerMTokens: 60 },
        { id: 'o1-mini', displayName: 'o1-mini', contextWindow: 128_000, supportsTools: false, supportsVision: false, inputCostPerMTokens: 3, outputCostPerMTokens: 12 },
    ],
});
