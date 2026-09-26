import React, { useState } from 'react';
import { DollarSign, Repeat, Lock, Clock, FileText } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { DossierEditorOverlay } from '../panels/DossierEditorOverlay';

export function BottomSummaryStrip() {
  const traceResult = useStore((s) => s.traceResult);
  const [showDossier, setShowDossier] = useState(false);
  const result = traceResult;
  if (!result) return null;

  const cards = [
    {
      icon: <DollarSign size={14} color="var(--color-primary)" />,
      label: 'TOTAL VALUE TRACED',
      value: `$${result.totalValueUsd.toLocaleString()} USD`,
      sub: 'CONFIRMED',
      color: 'var(--color-primary)',
    },
    {
      icon: <Repeat size={14} color="var(--color-secondary-dim)" />,
      label: `TORNADO CASH RUNS`,
      value: `${result.mixerHopCount} HOPS`,
      sub: 'DETECTED',
      color: 'var(--color-secondary-dim)',
    },
    {
      icon: <Lock size={14} color="var(--color-tertiary)" />,
      label: 'ASSETS RESTRICTED',
      value: result.assetsRestrictedUsd > 0
        ? `$${result.assetsRestrictedUsd.toLocaleString()} (${result.vaspMatches.find(v => v.frozen)?.freezeAuthority ?? 'PENDING'})`
        : '$0 — NOT YET FROZEN',
      sub: result.assetsRestrictedUsd > 0 ? 'FROZEN' : 'PENDING',
      color: 'var(--color-tertiary)',
    },
  ];

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface-1)', padding: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {cards.map((c, i) => (
          <div key={i} style={{
            flex: '1 1 300px', display: 'flex', alignItems: 'center', gap: '0.75rem',
            background: 'var(--color-surface-2)', border: `1px solid var(--color-border)`,
            borderRadius: '0.375rem', padding: '0.5rem 0.75rem',
          }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
              background: 'var(--color-surface-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {c.icon}
            </div>
            <div>
              <div className="label-sm" style={{ color: 'var(--color-text-faint)' }}>{c.label}</div>
              <div className="headline-sm" style={{ color: c.color, fontFamily: 'var(--font-sans)' }}>{c.value}</div>
              <div className="badge-base badge-neutral" style={{ marginTop: '2px' }}>{c.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Generate Dossier Button appended below metrics */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.75rem' }}>
        <button
          onClick={() => setShowDossier(true)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            padding: '0.75rem 2rem', background: 'var(--color-primary)',
            color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer',
            fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', transition: 'background 0.2s',
            width: '40%'
          }}
        >
          <FileText size={16} /> GENERATE FULL DOSSIER PDF
        </button>
      </div>

      {showDossier && <DossierEditorOverlay onClose={() => setShowDossier(false)} />}
    </div >
  );
}
