/**
 * LLM Provider interface - contrato comum a todos os providers.
 *
 * Implementacoes:
 *   - OpenRouter (prioritario, 1 chave = 200+ modelos)
 *   - OpenAI
 *   - Anthropic
 *   - Ollama (local, offline)
 *
 * @see docs/PRD-TECNICO.md §7
 */

export interface ModelInfo {
  id: string;
  displayName: string;
  /** Provider id (openrouter, openai, anthropic, ollama). Injetado pelo factory se omitido. */
  provider?: string;
  contextWindow: number;
  supportsTools: boolean;
  supportsVision: boolean;
  inputCostPerMTokens: number; // USD
  outputCostPerMTokens: number; // USD
}

export interface InvokeRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  systemPrompt?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  name?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface InvokeChunk {
  type: 'content' | 'tool_call' | 'tool_result' | 'done' | 'error';
  content?: string;
  toolCall?: ToolCall;
  toolResult?: { name: string; content: string; ok: boolean };
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMProvider {
  readonly id: 'openrouter' | 'openai' | 'anthropic' | 'ollama';
  readonly displayName: string;

  listModels(): Promise<ModelInfo[]>;

  invoke(request: InvokeRequest): Promise<AsyncIterable<InvokeChunk>>;

  estimateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<number>;
}
