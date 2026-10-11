import React from 'react';
import {
  LayoutDashboard, Network, FileText, Terminal, Activity,
  ChevronRight, Hexagon,
} from 'lucide-react';
import { useStore, type Page } from '../../store/useStore';

interface NavItem {
  id: Page;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'homepage',            label: 'Dashboard',        sublabel: 'Overview',         icon: <LayoutDashboard size={14} /> },
  { id: 'graph-explorer',      label: 'Graph Explorer',   sublabel: 'Transaction graph', icon: <Network size={14} /> },
  { id: 'linked-transactions', label: 'Transactions',     sublabel: 'Ledger',            icon: <FileText size={14} /> },
  { id: 'cypher-console',      label: 'Query Console',    sublabel: 'Neo4j Cypher',      icon: <Terminal size={14} /> },
];

export function Sidebar() {
  const activePage    = useStore((s) => s.activePage);
  const setActivePage = useStore((s) => s.setActivePage);
  const traceResult   = useStore((s) => s.traceResult);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-surface-1)' }}>

      {/* ── Wordmark ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '6px',
            background: 'var(--color-primary)',
            border: '1px solid var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Hexagon size={14} color="var(--color-primary-on)" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text)', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
              CryptoTracker
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Analytics
            </div>
          </div>
        </div>
      </div>

      {/* ── Section label ───────────────────────────────────────────────── */}
      <div style={{ padding: '0.875rem 1rem 0.375rem' }}>
        <span className="label-sm" style={{ color: 'var(--color-text-faint)' }}>Workspace</span>
      </div>

      {/* ── Nav items ───────────────────────────────────────────────────── */}
      <nav style={{ flex: 1, overflow: 'auto', padding: '0 0.5rem' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              onClick={() => setActivePage(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.625rem',
                width: '100%', padding: '0.5rem 0.625rem', marginBottom: '2px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                background: isActive ? 'var(--color-primary-container)' : 'transparent',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                cursor: 'pointer', textAlign: 'left',
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-3)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-muted)';
                }
              }}
            >
              <span style={{ flexShrink: 0 }}>{item.icon}</span>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontWeight: isActive ? 600 : 500, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}
                </div>
                <div className="label-sm" style={{ color: isActive ? 'var(--color-accent-green)' : 'var(--color-text-faint)', fontSize: '9px' }}>
                  {item.sublabel}
                </div>
              </div>
              {isActive && <ChevronRight size={10} style={{ flexShrink: 0 }} />}
            </button>
          );
        })}
      </nav>

      {/* ── Status footer ────────────────────────────────────────────────── */}
      <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
          <Activity size={11} color="var(--color-text-faint)" />
          <span className="label-sm" style={{ color: 'var(--color-text-faint)' }}>System</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span className="status-dot status-dot-active" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-muted)' }}>
            {traceResult ? `${traceResult.nodes.length} nodes indexed` : 'Ready'}
          </span>
        </div>
      </div>
    </div>
  );
}
