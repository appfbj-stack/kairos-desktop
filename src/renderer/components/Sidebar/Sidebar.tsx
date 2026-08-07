/**
 * Sidebar - navegacao principal.
 * Placeholder para Fase 3.
 */

export function Sidebar() {
  return (
    <aside
      style={{
        width: 240,
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        padding: 16,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>
        NAVEGAÇÃO
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {['Chat', 'Tarefas', 'Skills', 'Memória', 'Configurações'].map((item) => (
          <button
            key={item}
            type="button"
            style={{
              padding: '8px 12px',
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              textAlign: 'left',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              fontSize: 13,
            }}
          >
            {item}
          </button>
        ))}
      </nav>
    </aside>
  );
}
