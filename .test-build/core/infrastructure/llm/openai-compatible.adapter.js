/**
 * Generic OpenAI-compatible adapter.
 *
 * Reaproveitado por:
 *   - OpenRouter (priority)
 *   - OpenAI nativo
 *   - Ollama (com pequenos ajustes)
 *   - Qualquer provider que siga a spec OpenAI Chat Completions
 *
 * Docs: https://platform.openai.com/docs/api-reference/chat
 */
import { ProviderError } from '../../domain/errors/domain.error.js';
export function createOpenAICompatibleAdapter(config) {
    const { id, displayName, baseUrl, apiKeyEnvVar, models, defaultHeaders, transformRequest, transformChunk } = config;
    function getApiKey() {
        const key = process.env[apiKeyEnvVar];
        if (!key) {
            throw new ProviderError(`${displayName}: ${apiKeyEnvVar} nao configurado. Defina em .env ou variavel de ambiente.`);
        }
        return key;
    }
    function mapMessages(messages) {
        return messages.map((m) => {
            if (m.role === 'tool') {
                return {
                    role: 'tool',
                    tool_call_id: m.toolCallId,
                    content: m.content,
                };
            }
            if (m.role === 'assistant' && m.toolCalls) {
                return {
                    role: 'assistant',
                    content: m.content || null,
                    tool_calls: m.toolCalls.map((tc) => ({
                        id: tc.id,
                        type: 'function',
                        function: {
                            name: tc.name,
                            arguments: JSON.stringify(tc.arguments),
                        },
                    })),
                };
            }
            return { role: m.role, content: m.content };
        });
    }
    function mapTools(tools) {
        if (!tools || tools.length === 0)
            return undefined;
        return tools.map((t) => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
            },
        }));
    }
    return {
        id,
        displayName,
        async listModels() {
            // Para OpenRouter, podemos fazer GET /models dinamicamente
            // Para outros, usa a lista hardcoded
            if (id === 'openrouter') {
                try {
                    const res = await fetch(`${baseUrl}/models`, {
                        headers: { Authorization: `Bearer ${getApiKey()}` },
                    });
                    if (res.ok) {
                        const data = (await res.json());
                        return data.data.map((m) => ({
                            id: m.id,
                            displayName: m.name || m.id,
                            provider: id,
                            contextWindow: m.context_length || 4096,
                            supportsTools: !!m.supported_parameters?.includes('tools'),
                            supportsVision: !!m.architecture?.input_modalities?.includes('image'),
                            inputCostPerMTokens: parseFloat(m.pricing?.prompt || '0') * 1_000_000,
                            outputCostPerMTokens: parseFloat(m.pricing?.completion || '0') * 1_000_000,
                        }));
                    }
                }
                catch {
                    // Fallback para lista hardcoded
                }
            }
            return models;
        },
        async invoke(request) {
            const body = {
                model: request.model,
                messages: [
                    ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
                    ...mapMessages(request.messages),
                ],
                stream: true,
                ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
                ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
                ...(request.tools ? { tools: mapTools(request.tools) } : {}),
            };
            const finalBody = transformRequest ? transformRequest({ ...request }) : body;
            const res = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${getApiKey()}`,
                    ...defaultHeaders,
                },
                body: JSON.stringify(finalBody),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new ProviderError(`${displayName} HTTP ${res.status}: ${text}`);
            }
            if (!res.body) {
                throw new ProviderError(`${displayName}: no body`);
            }
            return streamOpenAIResponse(res.body, transformChunk);
        },
        estimateCost(model, inputTokens, outputTokens) {
            const m = models.find((x) => x.id === model);
            if (!m)
                return Promise.resolve(0);
            const cost = (inputTokens / 1_000_000) * m.inputCostPerMTokens +
                (outputTokens / 1_000_000) * m.outputCostPerMTokens;
            return Promise.resolve(cost);
        },
    };
}
async function* streamOpenAIResponse(body, transformChunk) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let usage;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:'))
                    continue;
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') {
                    yield { type: 'done', usage };
                    return;
                }
                try {
                    const parsed = JSON.parse(data);
                    // Captura usage no final
                    if (parsed.usage) {
                        usage = {
                            inputTokens: parsed.usage.prompt_tokens || 0,
                            outputTokens: parsed.usage.completion_tokens || 0,
                        };
                    }
                    const choice = parsed.choices?.[0];
                    if (!choice)
                        continue;
                    // Content delta
                    if (choice.delta?.content) {
                        const c = { type: 'content', content: choice.delta.content };
                        yield transformChunk ? transformChunk(parsed) || c : c;
                    }
                    // Tool call delta
                    if (choice.delta?.tool_calls) {
                        for (const tc of choice.delta.tool_calls) {
                            const chunk = {
                                type: 'tool_call',
                                toolCall: {
                                    id: tc.id || '',
                                    name: tc.function?.name || '',
                                    arguments: tc.function?.arguments ? safeJsonParse(tc.function.arguments) : {},
                                },
                            };
                            yield transformChunk ? transformChunk(parsed) || chunk : chunk;
                        }
                    }
                }
                catch {
                    // ignora chunks malformados
                }
            }
        }
    }
    finally {
        reader.releaseLock();
    }
}
function safeJsonParse(s) {
    try {
        return JSON.parse(s);
    }
    catch {
        return {};
    }
}
