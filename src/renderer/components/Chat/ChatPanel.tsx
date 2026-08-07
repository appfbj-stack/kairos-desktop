/**
 * ChatPanel - container principal do chat.
 * Placeholder para Fase 3.
 */

export function ChatPanel() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: 24,
        gap: 16,
      }}
    >
      <header>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Kairos</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
          Assistente empresarial inteligente
        </p>
      </header>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          textAlign: 'center',
          padding: 32,
        }}
      >
        <div>
          <p style={{ fontSize: 48, marginBottom: 16 }}>🌱</p>
          <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Fase 0 concluída.</p>
          <p style={{ fontSize: 13 }}>
            Chat funcional será entregue na <strong>Fase 3</strong>.
            <br />
            Por enquanto, o repositório está bootstrapped e o PRD técnico está em{' '}
            <code>docs/PRD-TECNICO.md</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
