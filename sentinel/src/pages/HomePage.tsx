import React from 'react';
import {
  Network, Terminal, FileText, BarChart3, Activity,
  ArrowRight, Search, Database, Cpu, TrendingUp, ShieldAlert,
} from 'lucide-react';
import { useStore } from '../store/useStore';

export function HomePage() {
  const setActivePage = useStore((s) => s.setActivePage);
  const traceResult   = useStore((s) => s.traceResult);
  const traceLoading  = useStore((s) => s.traceLoading);
  const traceError    = useStore((s) => s.traceError);
  const runTrace      = useStore((s) => s.runTrace);

  const [walletInput, setWalletInput] = React.useState('');

  const handleAnalyze = () => {
    if (walletInput.trim()) runTrace(walletInput.trim(), 5, 100, 0);
  };

  const riskScore = traceResult?.riskScore ?? 0;
  const riskColor = riskScore >= 80 ? 'var(--color-danger)' : riskScore >= 50 ? 'var(--color-warn)' : 'var(--color-success)';
  const riskLabel = riskScore >= 80 ? 'High Risk' : riskScore >= 50 ? 'Elevated' : 'Low Risk';

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--color-base)' }}>

      {/* ── Hero / search section ─────────────────────────────────────────── */}
      <div style={{
        padding: '3rem 3rem 2rem',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface-1)',
      }}>
        <div style={{ maxWidth: '680px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            background: 'var(--color-primary-container)',
            border: '1px solid var(--color-border)',
            padding: '0.25rem 0.75rem', borderRadius: '100px',
            marginBottom: '1.25rem',
          }}>
            <Activity size={10} color="var(--color-primary)" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-primary)', letterSpacing: '0.05em' }}>
              On-chain analytics · Ethereum mainnet
            </span>
          </div>

          <h1 style={{
            fontSize: '28px', fontWeight: 800, color: 'var(--color-text)',
            lineHeight: 1.25, margin: '0 0 0.75rem', letterSpacing: '-0.02em',
          }}>
            Blockchain Transaction<br />Intelligence
          </h1>

          <p style={{
            fontSize: '14px', color: 'var(--color-text-muted)',
            lineHeight: 1.7, margin: '0 0 1.75rem',
          }}>
            Trace fund flows, visualize transaction graphs, and calculate risk scores
            using heuristic analysis and ML-based wallet profiling.
          </p>

          {/* Inline search */}
          <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
            <div style={{
              flex: 1, minWidth: '280px',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border-strong)',
              borderRadius: 'var(--radius-md)',
              padding: '0.5rem 0.875rem',
              transition: 'border-color 0.15s',
            }}
              onFocusCapture={(e) => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-primary)'}
              onBlurCapture={(e) => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border-strong)'}
            >
              <Search size={13} color="var(--color-text-faint)" />
              <input
                type="text"
                value={walletInput}
                onChange={(e) => setWalletInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                placeholder="0x... Ethereum wallet address"
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  color: 'var(--color-text)', fontFamily: 'var(--font-mono)', fontSize: '12px',
                }}
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={handleAnalyze}
              disabled={traceLoading || !walletInput.trim()}
              style={{ padding: '0.5rem 1.25rem', fontSize: '13px' }}
            >
              {traceLoading ? 'Analyzing…' : 'Analyze wallet'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setActivePage('graph-explorer')}
              style={{ padding: '0.5rem 1rem', fontSize: '12px' }}
            >
              Graph Explorer <ArrowRight size={12} />
            </button>
          </div>

          {traceError && (
            <div style={{
              marginTop: '0.75rem', padding: '0.5rem 0.875rem',
              background: 'var(--color-danger-container)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 'var(--radius-md)',
              fontFamily: 'var(--font-mono)', fontSize: '12px',
              color: 'var(--color-danger)',
            }}>
              {traceError}
            </div>
          )}
        </div>
      </div>

      {/* ── Summary cards (only when trace data exists) ────────────────────── */}
      {traceResult ? (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '1px', borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-border)',
        }}>
          {[
            { label: 'Wallets found',    value: traceResult.nodes.length.toLocaleString(),               icon: <Database size={14} /> },
            { label: 'Transactions',     value: traceResult.edges.length.toLocaleString(),               icon: <Activity size={14} /> },
            { label: 'Total volume',     value: `${traceResult.totalValueTraced.toFixed(3)} ETH`,        icon: <TrendingUp size={14} /> },
            { label: 'Risk score',       value: `${riskScore}/100`,                                       icon: <ShieldAlert size={14} />, color: riskColor },
            { label: 'Risk level',       value: riskLabel,                                                icon: <BarChart3 size={14} />,  color: riskColor },
            { label: 'VASP offramps',    value: traceResult.vaspMatches.length.toLocaleString(),         icon: <Network size={14} /> },
          ].map((card, i) => (
            <div key={i} style={{
              padding: '1.25rem 1.5rem', background: 'var(--color-surface-1)',
              display: 'flex', flexDirection: 'column', gap: '0.375rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ color: 'var(--color-text-faint)' }}>{card.icon}</span>
                <span className="label-sm" style={{ color: 'var(--color-text-faint)' }}>{card.label}</span>
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700,
                color: (card as any).color ?? 'var(--color-text)',
              }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty state strip */
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '1px', borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-border)',
        }}>
          {['Wallets found', 'Transactions', 'Total volume', 'Risk score'].map((label, i) => (
            <div key={i} style={{
              padding: '1.25rem 1.5rem', background: 'var(--color-surface-1)',
              display: 'flex', flexDirection: 'column', gap: '0.375rem',
            }}>
              <span className="label-sm" style={{ color: 'var(--color-text-faint)' }}>{label}</span>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700,
                color: 'var(--color-surface-4)',
              }}>—</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Feature grid ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '2.5rem 3rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <span className="label-lg" style={{ color: 'var(--color-text-faint)' }}>Modules</span>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text)', margin: '0.375rem 0 0', letterSpacing: '-0.01em' }}>
            Analytics workspace
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
          {[
            {
              icon: <Network size={20} />,
              title: 'Graph Explorer',
              description: 'Interactive force-directed graph of on-chain fund flows. Visualize multi-hop paths, peel chains, and exchange offramps.',
              page: 'graph-explorer' as const,
              cta: 'Open explorer',
              accent: 'var(--color-primary)',
            },
            {
              icon: <Terminal size={20} />,
              title: 'Query Console',
              description: 'Write and run Cypher queries against the Neo4j graph database. AI-powered natural language to query generation included.',
              page: 'cypher-console' as const,
              cta: 'Open console',
              accent: '#818cf8',
            },
            {
              icon: <FileText size={20} />,
              title: 'Transactions',
              description: 'Sortable ledger of all traced transactions with risk scoring derived from heuristic graph analysis and ML profiling.',
              page: 'linked-transactions' as const,
              cta: 'View ledger',
              accent: '#f59e0b',
            },
            {
              icon: <Cpu size={20} />,
              title: 'Risk Analysis',
              description: 'Two-pass taint contagion propagates risk scores across the subgraph. LightGBM ML model profiles behavioral patterns.',
              page: 'graph-explorer' as const,
              cta: 'View analysis',
              accent: '#ef4444',
            },
          ].map((m, i) => (
            <div
              key={i}
              onClick={() => setActivePage(m.page)}
              style={{
                background: 'var(--color-surface-1)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.5rem',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: '0.875rem',
                transition: 'border-color 0.15s, transform 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = m.accent;
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{
                width: '36px', height: '36px', borderRadius: 'var(--radius-md)',
                background: `${m.accent}15`,
                border: `1px solid ${m.accent}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: m.accent,
              }}>
                {m.icon}
              </div>
              <div>
                <h3 style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text)', margin: '0 0 0.375rem' }}>
                  {m.title}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.65, margin: 0 }}>
                  {m.description}
                </p>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                fontFamily: 'var(--font-mono)', fontSize: '11px',
                color: m.accent, marginTop: 'auto',
              }}>
                {m.cta} <ArrowRight size={11} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Risk pipeline explainer ────────────────────────────────────────── */}
      <div style={{
        padding: '2rem 3rem 2.5rem',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-surface-1)',
      }}>
        <span className="label-lg" style={{ color: 'var(--color-text-faint)' }}>How it works</span>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text)', margin: '0.375rem 0 1.5rem', letterSpacing: '-0.01em' }}>
          Risk scoring pipeline
        </h2>

        {/* Risk bar */}
        <div style={{ marginBottom: '0.5rem', height: '8px', borderRadius: '4px', overflow: 'hidden',
          background: 'linear-gradient(90deg, var(--color-success) 0%, var(--color-warn) 55%, var(--color-danger) 100%)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          {['Low risk', 'Moderate', 'High risk', 'Critical'].map((l) => (
            <span key={l} className="label-sm" style={{ color: 'var(--color-text-faint)' }}>{l}</span>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
          {[
            { label: 'Graph heuristics',   desc: 'Peel-chain and mixer detection on the transaction graph topology.' },
            { label: 'ML classifier',      desc: 'LightGBM model trained on wallet behavior patterns for fraud probability.' },
            { label: 'Taint contagion',    desc: 'Two-pass algorithm propagates risk scores from flagged wallets to counterparties.' },
            { label: 'VASP matching',      desc: 'Detects known exchange deposit wallets as fund-flow offramps.' },
          ].map((step, i) => (
            <div key={i} style={{
              padding: '0.875rem 1rem',
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
            }}>
              <div className="label-md" style={{ color: 'var(--color-primary)', marginBottom: '0.375rem' }}>{step.label}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{step.desc}</div>
            </div>
          ))}
        </div>

        <p style={{ marginTop: '1rem', fontSize: '11px', color: 'var(--color-text-faint)', lineHeight: 1.6 }}>
          Risk scores are heuristic estimates derived from on-chain data analysis. They are not legal determinations
          and should be treated as analytical indicators, not proven facts.
        </p>
      </div>
    </div>
  );
}
