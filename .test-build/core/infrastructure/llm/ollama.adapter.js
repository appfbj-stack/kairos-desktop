/**
 * Ollama local adapter.
 *
 * Endpoint: http://localhost:11434 (default)
 * API: https://github.com/ollama/ollama/blob/main/docs/api.md
 * COMPATIVEL com OpenAI - usa /v1/chat/completions
 *
 * Vantagens:
 *   - Offline (sem internet)
 *   - Gratis
 *   - Privado (dados nao saem da maquina)
 */
import { createOpenAICompatibleAdapter } from './openai-compatible.adapter.js';
const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';
export const ollamaAdapter = createOpenAICompatibleAdapter({
    id: 'ollama',
    displayName: 'Ollama (local)',
    baseUrl: `${process.env.OLLAMA_BASE_URL || OLLAMA_DEFAULT_BASE_URL}/v1`,
    apiKeyEnvVar: 'OLLAMA_API_KEY', // Opcional, Ollama nao exige por default
    models: [
        // Modelos serao listados dinamicamente via GET /api/tags
        // Hardcoded como fallback
        { id: 'llama3.3', displayName: 'Llama 3.3', contextWindow: 128_000, supportsTools: false, supportsVision: false, inputCostPerMTokens: 0, outputCostPerMTokens: 0 },
        { id: 'llama3.2', displayName: 'Llama 3.2', contextWindow: 128_000, supportsTools: false, supportsVision: false, inputCostPerMTokens: 0, outputCostPerMTokens: 0 },
        { id: 'qwen2.5', displayName: 'Qwen 2.5', contextWindow: 128_000, supportsTools: false, supportsVision: false, inputCostPerMTokens: 0, outputCostPerMTokens: 0 },
        { id: 'mistral', displayName: 'Mistral', contextWindow: 32_000, supportsTools: false, supportsVision: false, inputCostPerMTokens: 0, outputCostPerMTokens: 0 },
        { id: 'gemma2', displayName: 'Gemma 2', contextWindow: 8_000, supportsTools: false, supportsVision: false, inputCostPerMTokens: 0, outputCostPerMTokens: 0 },
        { id: 'phi3.5', displayName: 'Phi-3.5', contextWindow: 128_000, supportsTools: false, supportsVision: false, inputCostPerMTokens: 0, outputCostPerMTokens: 0 },
    ],
});
