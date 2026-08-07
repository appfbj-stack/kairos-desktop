/**
 * ChatPanel - area principal de conversa.
 *
 * Features:
 *  - Lista de mensagens
 *  - Input com submit (Enter) + shift+enter para nova linha
 *  - Botao de voz (Web Speech API)
 *  - Streaming em tempo real
 *  - Auto-scroll
 *  - Mostra provider/model usado
 */

import { useEffect, useRef, useState } from 'react';
import { useChatStore, type ChatMessage } from '../../store/chat.store.js';
import { chatApi } from '../../lib/chat-api.js';
import { VoiceButton } from './VoiceButton.js';
import './ChatPanel.css';

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
  const [provider, setProvider] = useState('openrouter');
  const [model, setModel] = useState('openai/gpt-oss-20b:free');
  const [coreStatus, setCoreStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const conversation = activeId ? conversations.get(activeId) : null;
  const messages = conversation?.messages || [];

  // Auto-scroll no final quando streaming
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Health check do Core ao montar
  useEffect(() => {
    chatApi
      .health()
      .then(() => setCoreStatus('online'))
      .catch(() => setCoreStatus('offline'));
  }, []);

  // Cria conversa inicial
  useEffect(() => {
    if (!activeId) newConversation();
  }, [activeId, newConversation]);

  async function sendMessage(text: string) {
    if (!text.trim() || isStreaming || !activeId) return;
    const convId = activeId;

    // Adiciona mensagem do user
    const userMsg: Omit<ChatMessage, 'ts'> = { id: crypto.randomUUID(), role: 'user', content: text };
    addMessage(convId, userMsg);
    setInput('');

    // Prepara mensagem do assistant (vazia, sera preenchida pelo stream)
    const assistantId = crypto.randomUUID();
    addMessage(convId, { id: assistantId, role: 'assistant', content: '', streaming: true });
    setStreaming(true);

    // Recall de memoria (injeta contexto da empresa se houver)
    let systemPrompt = 'Voce eh o Kairos, um assistente de IA para Windows. Responda em portugues do Brasil de forma clara e util.';
    try {
      const recalled = await chatApi.recall(text, 3);
      if (recalled.context) {
        systemPrompt += '\n\n## Contexto da empresa\n' + recalled.context;
      }
    } catch {
      // Core offline - segue sem contexto
    }

    abortRef.current = new AbortController();
    let fullContent = '';

    try {
      for await (const chunk of chatApi.chatStream({
        messages: [{ role: 'user', content: text }],
        systemPrompt,
        provider,
        model,
        maxTokens: 600,
      })) {
        if (chunk.type === 'content' && chunk.content) {
          fullContent += chunk.content;
          appendToMessage(convId, assistantId, chunk.content);
        } else if (chunk.type === 'error') {
          appendToMessage(convId, assistantId, `\n\n_Erro: ${chunk.error}_`);
        }
      }
    } catch (err) {
      appendToMessage(convId, assistantId, `\n\n_Falha: ${(err as Error).message}_`);
    } finally {
      finalizeMessage(convId, assistantId);
      setStreaming(false);
      abortRef.current = null;
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
        <div className="chat-title">
          {conversation?.title || 'Nova conversa'}
        </div>
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
              <button onClick={() => setInput('O que voce pode fazer por mim?')}>
                O que voce pode fazer?
              </button>
              <button onClick={() => setInput('Me ajude a organizar minha semana.')}>
                Me ajude a organizar minha semana
              </button>
              <button onClick={() => setInput('Resuma as ultimas noticias de tecnologia.')}>
                Resuma as ultimas noticias de tecnologia
              </button>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      <footer className="chat-input-area">
        <VoiceButton
          onTranscript={(text) => sendMessage(text)}
          disabled={isStreaming}
        />
        <textarea
          className="chat-input"
          placeholder={isStreaming ? 'Aguardando resposta...' : 'Pergunte algo ao Kairos... (Enter envia, Shift+Enter quebra linha)'}
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
