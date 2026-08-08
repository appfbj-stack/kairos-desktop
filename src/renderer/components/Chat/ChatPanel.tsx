/**
 * ChatPanel - area principal de conversa.
 *
 * Fase 5: upload de arquivos (imagem, PDF, qualquer tipo).
 *  - Botao 📎 no footer ao lado do mic
 *  - Lista de anexos (AttachmentPreview) abaixo do input
 *  - Auto-extrai texto (PDF/TXT) no backend, multimodal vision pra imagens
 *  - Dual-mode: Electron (window.kairos.upload.pickAndUpload) / Browser (<input type=file>)
 */

import { useEffect, useRef, useState } from 'react';
import { useChatStore, type ChatMessage } from '../../store/chat.store.js';
import { chatApi, type ChatAttachment } from '../../lib/chat-api.js';
import { coreFetch } from '../../lib/chat-api.js';
import { VoiceButton } from './VoiceButton.js';
import { AttachmentPreview } from './AttachmentPreview.js';
import './ChatPanel.css';

function safeUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const MAX_ATTACHMENTS = 4;
const MAX_INPUT_LENGTH = 8 * 1024; // M1 fix: limita input a 8KB (~2k tokens)

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
  const [model, setModel] = useState('nvidia/nemotron-3-super-120b-a12b:free');
  const [coreStatus, setCoreStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversation = activeId ? conversations[activeId] : null;
  const messages: ChatMessage[] = conversation?.messages || [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    let cancelled = false;
    const checkHealth = async () => {
      try {
        await chatApi.health();
        if (!cancelled) setCoreStatus('online');
      } catch {
        if (!cancelled) setCoreStatus('offline');
      }
    };
    // A9 fix: polling periodico (30s) - se Core cair e voltar, status atualiza
    checkHealth();
    const interval = setInterval(checkHealth, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!activeId) {
      newConversation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickAndUpload(): Promise<ChatAttachment | null> {
    // Modo Electron: delega ao main process (dialog.showOpenDialog + upload)
    if (chatApi.isElectron) {
      try {
        setUploading(true);
        const att = await chatApi.pickAndUpload();
        return att;
      } catch (err) {
        appendSystemError(`Falha no upload: ${(err as Error).message}`);
        return null;
      } finally {
        setUploading(false);
      }
    }
    // Modo browser: aciona o input file
    fileInputRef.current?.click();
    return null;
  }

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite selecionar o mesmo arquivo dnv
    if (!file) return;
    try {
      setUploading(true);
      const att = await chatApi.uploadFile(file);
      addAttachment(att);
    } catch (err) {
      appendSystemError(`Falha no upload: ${(err as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  function addAttachment(att: ChatAttachment) {
    setAttachments((prev) => {
      // Limite: 4 anexos por mensagem
      if (prev.length >= MAX_ATTACHMENTS) {
        appendSystemError(`Limite de ${MAX_ATTACHMENTS} anexos por mensagem`);
        return prev;
      }
      // Dedup por id
      if (prev.find((p) => p.id === att.id)) return prev;
      return [...prev, att];
    });
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function appendSystemError(msg: string) {
    if (!activeId) return;
    // M2 fix: usa role 'system' com prefixo, nao 'assistant' (confundia o LLM)
    addMessage(activeId, {
      id: safeUuid(),
      role: 'system',
      content: `[Sistema] ${msg}`,
    });
  }

  async function sendMessage(text: string) {
    if ((!text.trim() && attachments.length === 0) || isStreaming || !activeId) return;
    // M1 fix: rejeita input maior que o limite (trunca ao inves de bloquear pra UX)
    if (text.length > MAX_INPUT_LENGTH) {
      appendSystemError(`Mensagem muito longa (${(text.length / 1024).toFixed(1)}KB). Limite: ${MAX_INPUT_LENGTH / 1024}KB. Tente quebrar em pedacos.`);
      return;
    }
    const convId = activeId;
    const attsToSend = attachments;

    const userMsg: Omit<ChatMessage, 'ts'> = {
      id: safeUuid(),
      role: 'user',
      content: text,
      attachments: attsToSend,
    };
    addMessage(convId, userMsg);
    setInput('');
    setAttachments([]);

    const assistantId = safeUuid();
    addMessage(convId, { id: assistantId, role: 'assistant', content: '', streaming: true });
    setStreaming(true);

    // C12 fix: system prompt agora vem do Core (centralizado em core/prompts/system-prompt.ts).
    // Aqui so chamamos o endpoint /system/prompt com a lista de skills.
    let systemPrompt = '';
    try {
      const promptResp = await coreFetch('/system/prompt');
      systemPrompt = promptResp.prompt || '';
    } catch (err) {
      // Fallback minimo se o endpoint falhar
      systemPrompt = 'Voce eh o Kairos, um assistente de IA para Windows. Responda em portugues do Brasil.';
    }
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
      // C1 fix: enviar historico da conversa (max 20 turnos anteriores) + mensagem atual com anexos.
      // O store ja tem as mensagens anteriores — aproveitamos pra dar contexto ao LLM.
      const MAX_HISTORY_TURNS = 20;
      const previousMessages = messages
        .filter((m) => !m.streaming && !m.error && m.content.trim().length > 0)
        .slice(-MAX_HISTORY_TURNS)
        .map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          // Anexos antigos nao sao reenviados (path absoluto ja nao faz sentido no novo contexto).
          // Mantemos apenas a mensagem de texto puro.
        }));
      // A mensagem atual (com anexos) eh a ultima do array
      const messagesForApi = [
        ...previousMessages,
        { role: 'user' as const, content: text, attachments: attsToSend },
      ];

      for await (const chunk of chatApi.chatStream({
        messages: messagesForApi,
        systemPrompt,
        provider: 'openrouter',
        model,
        maxTokens: 1500, // A4: aumentado para acomodar tool calls com argumentos grandes
        useTools: true, // Phase 4: habilita function calling
      })) {
        if (chunk.type === 'content' && chunk.content) {
          fullContent += chunk.content;
          appendToMessage(convId, assistantId, chunk.content);
        } else if (chunk.type === 'tool_call' && chunk.toolCall) {
          const args = JSON.stringify(chunk.toolCall.arguments || {});
          appendToMessage(convId, assistantId, `\n\n🤖 **Chamando \`${chunk.toolCall.name}\`** \`${args}\`\n`);
        } else if (chunk.type === 'tool_result' && chunk.toolResult) {
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
            <option value="nvidia/nemotron-3-super-120b-a12b:free">nemotron-3-super (free, rapido)</option>
            <option value="meta-llama/llama-3.3-70b-instruct:free">llama-3.3-70b (free)</option>
            <option value="openai/gpt-oss-20b:free">gpt-oss-20b (free, lento)</option>
            <option value="google/gemma-4-31b-it:free">gemma-4-31b (free, pode cair)</option>
            <option value="google/gemini-2.0-flash-exp:free">gemini-2.0-flash (vision)</option>
            <option value="qwen/qwen-2-vl-72b-instruct">qwen-2-vl-72b (vision, paid)</option>
          </select>
        </div>
      </header>

      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="empty-icon">✦</div>
            <h2>Ola! Sou o Kairos.</h2>
            <p>Me pergunte qualquer coisa, ou anexe um arquivo 📎.</p>
            <div className="suggestions">
              {/* M4 fix: botoes enviam direto ao inves de so preencher o input */}
              <button onClick={() => sendMessage('O que voce pode fazer por mim?')}>O que voce pode fazer?</button>
              <button onClick={() => sendMessage('Me ajude a organizar minha semana.')}>Me ajude a organizar minha semana</button>
              <button onClick={() => sendMessage('Resuma as ultimas noticias de tecnologia.')}>Resuma as ultimas noticias de tecnologia</button>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      <footer className="chat-input-area">
        {attachments.length > 0 && (
          <div className="chat-attachments">
            {attachments.map((a) => (
              <AttachmentPreview
                key={a.id}
                attachment={a}
                onRemove={removeAttachment}
              />
            ))}
          </div>
        )}
        <div className="chat-input-row">
          <VoiceButton onTranscript={(text) => sendMessage(text)} disabled={isStreaming} />
          <button
            type="button"
            className="upload-btn"
            onClick={pickAndUpload}
            disabled={isStreaming || uploading || attachments.length >= MAX_ATTACHMENTS}
            title={attachments.length >= MAX_ATTACHMENTS
              ? `Limite de ${MAX_ATTACHMENTS} anexos atingido`
              : 'Anexar arquivo (imagem, PDF, etc.)'}
            aria-label="Anexar arquivo"
          >
            {uploading ? '⏳' : '📎'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.txt,.md,.json,.csv,.html,.xml,.docx,.xlsx,.doc,.xls"
            multiple={false}
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
            aria-hidden="true"
          />
          <textarea
            className="chat-input"
            placeholder={isStreaming
              ? 'Aguardando resposta...'
              : attachments.length > 0
                ? `Mensagem com ${attachments.length} anexo${attachments.length > 1 ? 's' : ''} (Enter envia)`
                : 'Pergunte algo ao Kairos... (Enter envia)'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isStreaming}
          />
          <button
            className="send-btn"
            onClick={() => sendMessage(input)}
            disabled={(!input.trim() && attachments.length === 0) || isStreaming}
            title="Enviar (Enter)"
          >
            {isStreaming ? '⏳' : '➤'}
          </button>
        </div>
      </footer>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const atts = (message.attachments || []) as ChatAttachment[];
  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-avatar">{isUser ? 'Voce' : '✦'}</div>
      <div className="message-bubble">
        {atts.length > 0 && (
          <div className="message-attachments">
            {atts.map((a: ChatAttachment) => (
              <AttachmentPreview
                key={a.id}
                attachment={a}
                onRemove={() => { /* ja enviado, nao remove */ }}
              />
            ))}
          </div>
        )}
        {message.content || (message.streaming ? '...' : '')}
        {message.streaming && <span className="cursor">▊</span>}
      </div>
    </div>
  );
}
