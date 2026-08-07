/**
 * Sidebar - navegacao principal + lista de conversas.
 */

import { useChatStore } from '../../store/chat.store.js';
import { chatApi } from '../../lib/chat-api.js';

export function Sidebar() {
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeId);
  const setActive = useChatStore((s) => s.setActive);
  const newConversation = useChatStore((s) => s.newConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);

  const sorted = Array.from(conversations.values()).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <span className="logo-mark">✦</span>
          <span className="logo-text">Kairos</span>
        </div>
      </div>

      <button className="new-chat-btn" onClick={() => newConversation()}>
        <span>+</span> Nova conversa
      </button>

      <div className="sidebar-section-label">CONVERSAS</div>
      <nav className="conversations">
        {sorted.length === 0 && (
          <div className="empty-state">Sem conversas ainda.<br />Comece uma nova!</div>
        )}
        {sorted.map((conv) => (
          <div
            key={conv.id}
            className={`conversation-item ${activeId === conv.id ? 'active' : ''}`}
            onClick={() => setActive(conv.id)}
          >
            <div className="conversation-title">{conv.title}</div>
            <div className="conversation-meta">
              {conv.messages.length} msgs
            </div>
            <button
              className="conversation-delete"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Excluir conversa?')) deleteConversation(conv.id);
              }}
              title="Excluir"
            >
              ×
            </button>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="provider-badge">
          <span className="dot" /> OpenRouter · gpt-oss-20b (free)
        </div>
      </div>
    </aside>
  );
}

void chatApi;
