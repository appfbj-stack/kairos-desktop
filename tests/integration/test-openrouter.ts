/**
 * Teste de integracao: OpenRouter via Kairos AI Core.
 *
 * Roda com: `npm run test:openrouter` (carrega .env)
 *
 * Verifica:
 *   1. Provider OpenRouter configurado
 *   2. Listagem de modelos funciona
 *   3. Chat com streaming retorna texto
 *   4. Tools (function calling) sao reconhecidos
 *
 * NAO requer Electron - roda direto no Node.
 */

import { listProvidersUseCase } from '../../core/application/llm/select-model.usecase.js';
import { invokeLLMUseCase } from '../../core/application/llm/invoke-llm.usecase.js';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  \u2713 ${name}`);
    passed++;
  } else {
    console.log(`  \u2717 ${name} ${detail ? `(${detail})` : ''}`);
    failed++;
  }
}

async function main() {
  console.log('\n=== Teste OpenRouter via Kairos AI Core ===\n');

  if (!process.env.OPENROUTER_API_KEY) {
    console.error('ERRO: OPENROUTER_API_KEY nao configurado. Defina em .env');
    process.exit(1);
  }

  // 1. List providers
  console.log('1. Listagem de providers:');
  const providers = await listProvidersUseCase.execute();
  const openRouter = providers.find((p) => p.id === 'openrouter');
  check('OpenRouter provider existe', !!openRouter);
  check(
    'OpenRouter isConfigured=true',
    openRouter?.isConfigured === true,
    `isConfigured=${openRouter?.isConfigured}`,
  );

  // 2. List models
  console.log('\n2. Listagem de modelos:');
  const models = await openRouter!.models;
  // (ja estao como array)
  const modelList = (openRouter as any).models as any[] | undefined;
  // O select-model retorna models como info por provider
  const allModels = providers.flatMap((p) => (p as any).models || []);
  check('Tem modelos disponiveis', allModels.length > 0, `${allModels.length} modelos`);
  const hasGPT4oMini = allModels.some((m: any) => m.id?.includes('gpt-4o-mini'));
  check('gpt-4o-mini esta na lista', hasGPT4oMini);

  // 3. Chat streaming simples
  console.log('\n3. Chat streaming (pergunta simples):');
  const startTime = Date.now();
  let content = '';
  let chunks = 0;
  try {
    const result = await invokeLLMUseCase.execute({
      messages: [
        { role: 'user', content: 'Responda em uma frase: o que e o Kairos Desktop AI?' },
      ],
      model: 'openai/gpt-oss-20b:free',
      maxTokens: 300,
    });

    for await (const chunk of result.stream) {
      if (chunk.type === 'content' && chunk.content) {
        content += chunk.content;
        chunks++;
      }
    }

    const elapsed = Date.now() - startTime;
    check('Recebeu pelo menos 1 chunk', chunks > 0, `chunks=${chunks}`);
    check('Conteudo nao vazio', content.length > 10, `len=${content.length}`);
    check('Resposta menciona Kairos', /kairos/i.test(content), `content="${content.slice(0, 80)}..."`);
    check('Streaming rapido (<10s para 100 tokens)', elapsed < 10_000, `${elapsed}ms`);

    console.log(`     \u2192 "${content.slice(0, 120)}..."`);
  } catch (err) {
    check('Chat streaming executou', false, (err as Error).message);
  }

  // 4. Tools (function calling) - usa modelo que suporta tools
  console.log('\n4. Tool calling:');
  try {
    const result = await invokeLLMUseCase.execute({
      messages: [
        { role: 'user', content: 'Qual o clima em Tokyo agora?' },
      ],
      model: 'openai/gpt-oss-20b:free',
      maxTokens: 300,
      tools: [
        {
          name: 'get_weather',
          description: 'Retorna o clima atual de uma cidade',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'Nome da cidade' },
            },
            required: ['city'],
          },
        },
      ],
    });

    let toolCallFound = false;
    for await (const chunk of result.stream) {
      if (chunk.type === 'tool_call' && chunk.toolCall?.name === 'get_weather') {
        toolCallFound = true;
      }
    }
    check('LLM chamou get_weather', toolCallFound);
  } catch (err) {
    check('Tool calling executou', false, (err as Error).message);
  }

  // Resumo
  console.log(`\n=== Resultado: ${passed} OK, ${failed} falharam ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
