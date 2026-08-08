/**
 * ChatPanel - area principal de conversa.
 */

import { useEffect, useRef, useState } from 'react';
import { useChatStore, type ChatMessage } from '../../store/chat.store.js';
import { chatApi } from '../../lib/chat-api.js';
import { VoiceButton } from './VoiceButton.js';
import './ChatPanel.css';

function safeUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function ChatPanel() {
  const activeId = useChatStore((s) => s.activeId);
  const conversations = useChatStore((s) => s.conversations);
  const addMessage = useChatStore((s) => s.addMessage);
  const appendToMessage = useChatStore((s) => s.appendToMessage);
  const finalizeMessage = useChatStore((s) => s.finalizeMessage);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const setStreaming = useChatStore((s) => s.setStreaming);
  const newConversation = useChatStore((s) => s.newConversation);

  const [input, setInput] = useState('');
  const [model, setModel] = useState('openai/gpt-oss-20b:free');
  const [coreStatus, setCoreStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversation = activeId ? conversations[activeId] : null;
  const messages: ChatMessage[] = conversation?.messages || [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    chatApi
      .health()
      .then(() => setCoreStatus('online'))
      .catch(() => setCoreStatus('offline'));
  }, []);

  useEffect(() => {
    if (!activeId) {
      newConversation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendMessage(text: string) {
    if (!text.trim() || isStreaming || !activeId) return;
    const convId = activeId;

    const userMsg: Omit<ChatMessage, 'ts'> = { id: safeUuid(), role: 'user', content: text };
    addMessage(convId, userMsg);
    setInput('');

    const assistantId = safeUuid();
    addMessage(convId, { id: assistantId, role: 'assistant', content: '', streaming: true });
    setStreaming(true);

    let systemPrompt =
      'Voce eh o Kairos, um assistente de IA para Windows. Responda em portugues do Brasil.\n\n' +
      'Voce tem acesso a 13 tools do Windows:\n' +
      '- file_manager_list(path, limit): lista arquivos/pastas em um diretorio\n' +
      '- file_manager_read(path, maxBytes): le conteudo de arquivo texto (max 50KB)\n' +
      '- search_files(pattern, path, recursive, limit): busca arquivos por nome\n' +
      '- app_launcher_open(target): abre app, URL ou arquivo com programa padrao\n' +
      '- clipboard_read(): le o clipboard atual\n' +
      '- clipboard_write(text): escreve no clipboard\n' +
      '- office_excel_read(path, sheet?, maxRows?): le planilha Excel via COM\n' +
      '- office_word_read(path, maxChars?): extrai texto de documento Word via COM\n' +
      '- pdf_convert(inputPath, outputPath?): converte DOCX/DOC/RTF/TXT/MD/XLSX para PDF\n' +
      '- browser_navigate(url?, query?): abre URL ou faz busca no Google\n' +
      '- office_excel_write(path, operation, ...): ESCREVE em planilha Excel. operation=set_cell|add_row|add_header|create_sheet\n' +
      '- office_word_write(templatePath, outputPath, replacements): preenche template Word com {{chave}}=valor\n' +
      '- file_organize(sourceDir, action, ...): organiza arquivos. action=move_by_type|move_by_date|rename_pattern|dedupe|create_structure\n\n' +
      'Para operacoes de escrita (excel_write, word_write, file_organize), sempre faca dryRun primeiro se o usuario nao tiver certeza.\n\n' +
      'Use-as quando o usuario pedir algo do PC. Seja direto, sem enrolacao. ' +
      'Quando precisar de varias tools, chame em sequencia (o sistema executa e devolve o resultado).';
    try {
      const recalled = await chatApi.recall(text, 3);
      if (recalled.context) {
        systemPrompt += '\n\n## Contexto\n' + recalled.context;
      }
    } catch {
      // sem contexto
    }

    let fullContent = '';
    try {
      for await (const chunk of chatApi.chatStream({
        messages: [{ role: 'user', content: text }],
        systemPrompt,
        provider: 'openrouter',
        model,
        maxTokens: 600,
        useTools: true, // Phase 4: habilita function calling
      })) {
        if (chunk.type === 'content' && chunk.content) {
          fullContent += chunk.content;
          appendToMessage(convId, assistantId, chunk.content);
        } else if (chunk.type === 'tool_call' && chunk.toolCall) {
          // Mostra tool call como texto formatado
          const args = JSON.stringify(chunk.toolCall.arguments || {});
          appendToMessage(convId, assistantId, `\n\n🤖 **Chamando \`${chunk.toolCall.name}\`** \`${args}\`\n`);
        } else if (chunk.type === 'tool_result' && chunk.toolResult) {
          // Mostra tool result
          const icon = chunk.toolResult.ok ? '✅' : '❌';
          appendToMessage(convId, assistantId, `\n${icon} **Resultado**:\n\`\`\`\n${chunk.toolResult.content}\n\`\`\`\n`);
        } else if (chunk.type === 'error') {
          appendToMessage(convId, assistantId, `\n\n_Erro: ${chunk.error}_`);
        }
      }
    } catch (err) {
      appendToMessage(convId, assistantId, `\n\n_Falha: ${(err as Error).message}_`);
    } finally {
      finalizeMessage(convId, assistantId);
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="chat-panel">
      <header className="chat-header">
        <div className="chat-title">{conversation?.title || 'Nova conversa'}</div>
        <div className="chat-meta">
          <span className={`core-status core-${coreStatus}`}>
            {coreStatus === 'online' ? '● online' : coreStatus === 'offline' ? '○ offline' : '⟳ verificando'}
          </span>
          <select value={model} onChange={(e) => setModel(e.target.value)} className="model-select">
            <option value="openai/gpt-oss-20b:free">gpt-oss-20b (free)</option>
            <option value="google/gemma-4-31b-it:free">gemma-4-31b (free)</option>
            <option value="nvidia/nemotron-3-super-120b-a12b:free">nemotron-3-super (free)</option>
            <option value="meta-llama/llama-3.3-70b-instruct:free">llama-3.3-70b (free)</option>
          </select>
        </div>
      </header>

      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="empty-icon">✦</div>
            <h2>Ola! Sou o Kairos.</h2>
            <p>Me pergunte qualquer coisa, ou use o botao de voz 🎤.</p>
            <div className="suggestions">
              <button onClick={() => setInput('O que voce pode fazer por mim?')}>O que voce pode fazer?</button>
              <button onClick={() => setInput('Me ajude a organizar minha semana.')}>Me ajude a organizar minha semana</button>
              <button onClick={() => setInput('Resuma as ultimas noticias de tecnologia.')}>Resuma as ultimas noticias de tecnologia</button>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      <footer className="chat-input-area">
        <VoiceButton onTranscript={(text) => sendMessage(text)} disabled={isStreaming} />
        <textarea
          className="chat-input"
          placeholder={isStreaming ? 'Aguardando resposta...' : 'Pergunte algo ao Kairos... (Enter envia)'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isStreaming}
        />
        <button
          className="send-btn"
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isStreaming}
          title="Enviar (Enter)"
        >
          {isStreaming ? '⏳' : '➤'}
        </button>
      </footer>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-avatar">{isUser ? 'Voce' : '✦'}</div>
      <div className="message-bubble">
        {message.content || (message.streaming ? '...' : '')}
        {message.streaming && <span className="cursor">▊</span>}
      </div>
    </div>
  );
}
