import React, { useState } from 'react';
import { TrendingUp, Repeat, Lock, FileText } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { DossierEditorOverlay } from '../panels/DossierEditorOverlay';

export function BottomSummaryStrip() {
  const traceResult = useStore((s) => s.traceResult);
  const [showDossier, setShowDossier] = useState(false);
  const result = traceResult;
  if (!result) return null;

  const cards = [
    {
      icon: <TrendingUp size={13} color="var(--color-primary)" />,
      label: 'Total volume traced',
      value: `$${result.totalValueUsd.toLocaleString()} USD`,
      sub: `${result.totalValueTraced.toFixed(3)} ${result.chain || (result.rootAddress.startsWith('0x') ? 'ETH' : 'SOL')}`,
      color: 'var(--color-primary)',
    },
    {
      icon: <Repeat size={13} color="var(--color-warn)" />,
      label: 'Mixer hops detected',
      value: `${result.mixerHopCount}`,
      sub: result.mixerHopCount > 0 ? 'Pattern found' : 'None detected',
      color: 'var(--color-warn)',
    },
    {
      icon: <Lock size={13} color="var(--color-text-muted)" />,
      label: 'VASP offramps',
      value: result.vaspMatches.length > 0
        ? `${result.vaspMatches.length} identified`
        : 'None detected',
      sub: result.vaspMatches.map(v => v.exchange).join(', ') || '—',
      color: 'var(--color-text-muted)',
    },
  ];

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface-1)', padding: '0.5rem', maxHeight: '140px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {cards.map((c, i) => (
          <div key={i} style={{
            flex: '1 1 220px', display: 'flex', alignItems: 'center', gap: '0.625rem',
            background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', padding: '0.5rem 0.75rem',
          }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
              background: 'var(--color-surface-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {c.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="label-sm" style={{ color: 'var(--color-text-faint)' }}>{c.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: c.color }}>{c.value}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Generate Report Button */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.625rem' }}>
        <button
          onClick={() => setShowDossier(true)}
          className="btn btn-primary"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
            padding: '0.5rem 1.5rem', width: '280px', fontSize: '12px',
          }}
        >
          <FileText size={13} /> Generate report
        </button>
      </div>

      {showDossier && <DossierEditorOverlay onClose={() => setShowDossier(false)} />}
    </div>
  );
}
