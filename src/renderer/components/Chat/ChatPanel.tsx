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
    addMessage(activeId, {
      id: safeUuid(),
      role: 'assistant',
      content: `\n\n_Erro: ${msg}_`,
    });
  }

  async function sendMessage(text: string) {
    if ((!text.trim() && attachments.length === 0) || isStreaming || !activeId) return;
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

    let systemPrompt =
      'Voce eh o Kairos, um assistente de IA para Windows. Responda em portugues do Brasil.\n\n' +
      'Voce tem acesso a 15 tools do Windows:\n' +
      '- file_manager_list(path, limit): lista arquivos/pastas em um diretorio\n' +
      '- file_manager_read(path, maxBytes): le conteudo de arquivo texto (max 50KB)\n' +
      '- search_files(pattern, path, recursive, limit): busca arquivos por nome\n' +
      '- app_launcher_open(target): abre app, URL ou arquivo com programa padrao\n' +
      '- clipboard_read(): le o clipboard atual\n' +
      '- clipboard_write(text): escreve no clipboard\n' +
      '- office_excel_read(path, sheet?, maxRows?): le planilha Excel via pure-Node (exceljs)\n' +
      '- office_word_read(path, maxChars?): extrai texto de documento Word via pure-Node (mammoth)\n' +
      '- pdf_convert(inputPath, outputPath?): converte DOCX/DOC/RTF/TXT/MD/XLSX para PDF via LibreOffice\n' +
      '- browser_navigate(url?, query?): abre URL ou faz busca no Google\n' +
      '- office_excel_write(path, operation, ...): ESCREVE em planilha Excel. operation=set_cell|add_row|add_header|create_sheet\n' +
      '- office_word_write(templatePath, outputPath, replacements): preenche template Word com {{chave}}=valor\n' +
      '- file_organize(sourceDir, action, ...): organiza arquivos. action=move_by_type|move_by_date|rename_pattern|dedupe|create_structure\n' +
      '- generate_visual(type, outputDir, ...): gera PNG (banner vertical 1080x1350, card quadrado 1080x1080, ou carrossel multi-slide Instagram). Renderiza HTML via Chromium.\n' +
      '- igreja_documento(mode, outputDir, ...): gera PDF de documento oficial da igreja. mode=carta|recibo|ata|dizimo. Use para carta de apresentacao/transferencia/recomendacao, recibo de dizimo/oferta, ata de reuniao, ou relatorio mensal de dizimos. Renderiza via Playwright -> PDF, nao precisa de Office.\n\n' +
      'Sobre arquivos anexados pelo usuario:\n' +
      '- Imagens sao enviadas como multimodal (voce VE a imagem)\n' +
      '- PDF e texto (TXT/MD/JSON/HTML) tem o texto extraido e injetado no contexto\n' +
      '- Outros formatos (xlsx, docx, zip) vem com o path no disco; use a skill apropriada (office_excel_read, file_manager_read, etc.) para processar\n\n' +
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
      // Importante: mandar attachments NO user message (ultimo), nao no system prompt
      const messagesForApi = [{ role: 'user' as const, content: text, attachments: attsToSend }];

      for await (const chunk of chatApi.chatStream({
        messages: messagesForApi,
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
            <option value="openai/gpt-oss-20b:free">gpt-oss-20b (free)</option>
            <option value="google/gemma-4-31b-it:free">gemma-4-31b (free)</option>
            <option value="nvidia/nemotron-3-super-120b-a12b:free">nemotron-3-super (free)</option>
            <option value="meta-llama/llama-3.3-70b-instruct:free">llama-3.3-70b (free)</option>
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
