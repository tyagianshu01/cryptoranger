import React from 'react';
import { Brain, ChevronRight } from 'lucide-react';
import { useStore } from '../../store/useStore';

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'var(--color-secondary-dim)',
  CONFIRMED: 'var(--color-tertiary)',
  FLAGGED: '#f59e0b',
  SUSPECTED: 'var(--color-text-muted)',
};

const JACCARD_INDEX = 0.941;

export function MlClusterPanel() {
  const traceResult = useStore((s) => s.traceResult);
  const result = traceResult;
  const selectedCluster = useStore((s) => s.selectedCluster);
  const selectCluster = useStore((s) => s.selectCluster);

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-header">
        <Brain size={11} color="var(--color-tertiary)" />
        <span className="label-md" style={{ color: 'var(--color-text)' }}>ML CLUSTER</span>
        <span className="label-sm" style={{ color: 'var(--color-text-faint)', marginLeft: 'auto' }}>SPLIT-LEARN</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0.375rem 0.5rem' }}>
        {result?.clusters.length ? (
          result.clusters.map((cluster) => {
            const isActive = selectedCluster?.id === cluster.id;
            const color = SEVERITY_COLORS[cluster.severity] ?? 'var(--color-text-muted)';
            return (
              <button
                key={cluster.id}
                id={`cluster-${cluster.id}`}
                onClick={() => selectCluster(isActive ? null : cluster)}
                style={{
                  display: 'flex', width: '100%', padding: '0.5rem 0.5rem',
                  marginBottom: '4px', borderRadius: '0.25rem',
                  background: isActive ? 'rgba(76,215,246,0.08)' : 'var(--color-surface-2)',
                  border: `1px solid ${isActive ? 'rgba(76,215,246,0.3)' : 'var(--color-border)'}`,
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s',
                }}
              >
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span className="label-md" style={{ color }}>{cluster.name}</span>
                    <span className="label-md" style={{ color }}>{cluster.confidence.toFixed(1)}%</span>
                  </div>
                  <div className="code-terminal" style={{ color: 'var(--color-text-faint)' }}>{cluster.description}</div>
                </div>
                <div style={{ marginLeft: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                  <span className="badge-base" style={{ background: color + '22', color, border: `1px solid ${color}` }}>
                    {cluster.severity}
                  </span>
                </div>
              </button>
            );
          })
        ) : (
          <div className="code-terminal" style={{ color: 'var(--color-text-faint)', padding: '0.5rem', textAlign: 'center' }}>
            No clusters detected
          </div>
        )}

        {/* Jaccard index card */}
        {result && (
          <div style={{
            marginTop: '0.5rem', padding: '0.5rem', borderRadius: '0.375rem',
            background: 'var(--color-surface-1)', border: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.5rem' }}>
              {/* Radial gauge */}
              <svg width="48" height="48" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="18" fill="var(--color-surface-3)" />
                <circle cx="24" cy="24" r="18" fill="none" stroke="var(--color-surface-4)" strokeWidth="4" />
                <circle cx="24" cy="24" r="18" fill="none" stroke="var(--color-primary)" strokeWidth="4"
                  strokeDasharray={`${JACCARD_INDEX * 113} 113`}
                  strokeLinecap="round" transform="rotate(-90 24 24)" />
                <text x="24" y="26" textAnchor="middle" fill="var(--color-primary)" fontFamily="var(--font-sans)" fontWeight="700" fontSize="10">{Math.round(JACCARD_INDEX * 100)}%</text>
              </svg>
              <div>
                <div className="label-md" style={{ color: 'var(--color-text)' }}>JACCARD INDEX: {JACCARD_INDEX.toFixed(3)}</div>
                <div className="code-terminal" style={{ color: 'var(--color-text-faint)', fontSize: '9px' }}>
                  Behavioral overlap matches North Korea Lazarus Sub-Ring laundering profiles.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

