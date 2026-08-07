/**
 * App root - layout principal com Sidebar + ChatPanel.
 */

import { Sidebar } from './components/Sidebar/Sidebar.js';
import { ChatPanel } from './components/Chat/ChatPanel.js';
import { useChatStore } from './store/chat.store.js';

export function App() {
  const sidebarOpen = useChatStore((s) => s.sidebarOpen);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <ChatPanel />
      </main>
    </div>
  );
}
