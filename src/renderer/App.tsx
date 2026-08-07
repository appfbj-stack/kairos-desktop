/**
 * App root - layout principal com sidebar + chat.
 * Implementacao minima (Fase 3). Evolui nas fases seguintes.
 */

import { ChatPanel } from './components/Chat/ChatPanel.js';
import { Sidebar } from './components/Sidebar/Sidebar.js';

export function App() {
  return (
    <div className="kairos-app">
      <Sidebar />
      <main className="kairos-main">
        <ChatPanel />
      </main>
    </div>
  );
}
