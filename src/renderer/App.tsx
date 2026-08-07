import { Sidebar } from './components/Sidebar/Sidebar.js';
import { ChatPanel } from './components/Chat/ChatPanel.js';

export function App() {
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <Sidebar />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ChatPanel />
      </main>
    </div>
  );
}
