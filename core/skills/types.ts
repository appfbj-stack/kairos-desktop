/**
 * Skill framework - tipos compartilhados.
 *
 * Uma Skill é uma "ferramenta" que o LLM pode invocar via function calling.
 * Cada skill define:
 *  - name: identificador único (snake_case)
 *  - description: o que faz (LLM usa pra decidir quando chamar)
 *  - parameters: JSON Schema dos argumentos
 *  - execute: função que roda a skill e retorna o resultado
 *
 * O LLM recebe a lista de skills como "tools" no request.
 * Quando o LLM retorna tool_calls, o Core executa as skills
 * e manda os resultados de volta pro LLM (loop ate resposta final).
 */

/**
 * JSON Schema simplificado (subset do que OpenRouter aceita).
 * Para o MVP, usamos apenas tipos basicos: object, string, number, boolean, array, enum.
 */
export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  default?: unknown;
}

export interface JsonSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Contexto passado para o execute() da skill.
 * Vazio no MVP; em versoes futuras pode ter userId, sessionId, etc.
 */
export interface SkillContext {
  /** Working directory permitido (seguranca) */
  cwd?: string;
}

/**
 * Resultado da execução de uma skill.
 * O `content` é o que vai de volta pro LLM como tool result.
 */
export interface SkillResult {
  /** Texto retornado pro LLM (deve ser informativo e sucinto) */
  content: string;
  /** Dados estruturados opcionais (para o renderer exibir rico) */
  data?: unknown;
  /** Marcador de erro - o LLM recebe o content como tool result mesmo assim */
  error?: boolean;
}

/**
 * Definição de uma skill.
 */
export interface Skill {
  /** Identificador único (ex: "file_manager_list") */
  name: string;
  /** Descrição human-readable (LLM usa pra decidir) */
  description: string;
  /** Categoria: file, app, search, clipboard, office, pdf, browser, system */
  category: 'file' | 'app' | 'search' | 'clipboard' | 'office' | 'pdf' | 'browser' | 'system';
  /** JSON Schema dos parâmetros aceitos */
  parameters: JsonSchema;
  /**
   * Executa a skill. Argumentos validados contra parameters.
   * Retorna texto (vai pro LLM) + dados estruturados opcionais.
   */
  execute(args: Record<string, unknown>, ctx: SkillContext): Promise<SkillResult>;
}
