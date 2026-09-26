import React from 'react';
import {
  Home, Network, Layers, Share2, Building2, FileText, Terminal,
  Activity, ChevronRight,
} from 'lucide-react';
import { useStore, type Page } from '../../store/useStore';

interface NavItem {
  id: Page;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'homepage', label: 'Home', sublabel: 'COMMAND CENTER', icon: <Home size={14} /> },
  { id: 'graph-explorer', label: 'Graph Explorer', sublabel: 'TOPOLOGY', icon: <Network size={14} /> },
  { id: 'linked-transactions', label: 'Linked Transactions', sublabel: 'LEDGER AUDIT', icon: <FileText size={14} /> },
  { id: 'cypher-console', label: 'Cypher Console', sublabel: 'NEO4J', icon: <Terminal size={14} /> },
];

export function Sidebar() {
  const activePage = useStore((s) => s.activePage);
  const setActivePage = useStore((s) => s.setActivePage);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-surface-1)' }}>
      {/* ── Logo ────────────────────────────────────────────────────────────── */}
      <div style={{ padding: '0.875rem 1rem 0.75rem', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg"
            alt="Ashok Stambh - Emblem of India"
            style={{ height: '36px', filter: 'brightness(0) saturate(100%) invert(13%) sepia(85%) saturate(3015%) hue-rotate(240deg) brightness(69%) contrast(124%)' }}
          /* Note: We apply an SVG filter to map the black graphic to the Ashoka Navy color approx (#000080). If it fails perfectly, it still remains appropriately dark. */
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: '13px', color: 'var(--color-primary)', lineHeight: 1.25 }}>
              GOVERNMENT
            </span>
            <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: '13px', color: 'var(--color-primary)', lineHeight: 1.25 }}>
              OF INDIA
            </span>
          </div>
        </div>
        <div>
          <div className="label-sm" style={{ color: 'var(--color-text-faint)' }}>HOME MINISTRY AND CENTRAL AFFAIRS</div>
          <div className="label-sm" style={{ color: 'var(--color-accent)' }}>FINANCIAL INTELLIGENCE</div>
        </div>
      </div>

      {/* ── Section label ──────────────────────────────────────────────────── */}
      <div style={{ padding: '0.75rem 1rem 0.375rem' }}>
        <span className="label-sm" style={{ color: 'var(--color-text-faint)' }}>ANALYTICS SUITE</span>
      </div>

      {/* ── Nav items ──────────────────────────────────────────────────────── */}
      <nav style={{ flex: 1, overflow: 'auto', padding: '0 0.5rem' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              onClick={() => setActivePage(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                width: '100%',
                padding: '0.5rem 0.625rem',
                marginBottom: '2px',
                borderRadius: '0.25rem',
                border: 'none',
                borderLeft: isActive ? '3px solid var(--color-accent)' : '3px solid transparent',
                background: isActive ? 'var(--color-primary-container)' : 'transparent',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-2)';
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
              <span style={{ flexShrink: 0, color: isActive ? 'var(--color-primary)' : 'inherit' }}>{item.icon}</span>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div className="body-md" style={{ fontWeight: isActive ? 600 : 500, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}
                </div>
                <div className="label-md" style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-text-faint)', fontSize: '10px', opacity: 0.9 }}>
                  {item.sublabel}
                </div>
              </div>
              {isActive && <ChevronRight size={10} color="var(--color-primary)" opacity={0.6} />}
            </button>
          );
        })}
      </nav>

    </div>
  );
}
