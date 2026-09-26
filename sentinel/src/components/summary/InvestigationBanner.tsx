import React, { useState } from 'react';
import { Copy, CheckCheck, AlertTriangle, Globe } from 'lucide-react';
import { useStore } from '../../store/useStore';

export function InvestigationBanner() {
  const traceResult = useStore((s) => s.traceResult);
  const result = traceResult;
  const [copied, setCopied] = useState(false);

  if (!traceResult) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(traceResult.rootAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const riskScore = result.riskScore;
  const riskColor = riskScore >= 80 ? 'var(--color-secondary)' : riskScore >= 50 ? '#D97706' : 'var(--color-primary)';


  return (
    <div style={{
      background: 'var(--color-lowest)',
      borderBottom: '1px solid var(--color-border)',
      padding: '0.75rem 1rem',
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem' }}>

        {/* Risk score gauge */}
        <div style={{ flexShrink: 0, textAlign: 'center' }}>
          <svg width="68" height="68" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r="28" fill="none" stroke="var(--color-surface-3)" strokeWidth="6" />
            <circle
              cx="36" cy="36" r="28" fill="none"
              stroke={riskColor}
              strokeWidth="6"
              strokeDasharray={`${(riskScore / 100) * 175.9} 175.9`}
              strokeLinecap="round"
              transform="rotate(-90 36 36)"
            />
            <text x="36" y="33" textAnchor="middle" fill={riskColor} fontFamily="var(--font-sans)" fontWeight="800" fontSize="16">{riskScore}</text>
            <text x="36" y="45" textAnchor="middle" fill="var(--color-text-faint)" fontFamily="var(--font-mono)" fontSize="6" letterSpacing="0.08em">RISK</text>
          </svg>
          <div className="label-sm" style={{ color: riskColor, marginTop: '-2px', fontWeight: 700 }}>
            {riskScore >= 80 ? 'CRITICAL' : riskScore >= 50 ? 'ELEVATED' : 'LOW'}
          </div>
        </div>

        {/* Case metadata */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <div className="label-sm" style={{ color: 'var(--color-text-faint)' }}>CASE ID:</div>
            <span className="code-terminal" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{result.caseId}</span>

            <div style={{ marginLeft: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span className="code-terminal" style={{ color: 'var(--color-text)', fontSize: '12px', fontWeight: 500 }}>
                {result.rootAddress.slice(0, 14)}...{result.rootAddress.slice(-8)}
              </span>
              <button
                id="copy-address-btn"
                onClick={handleCopy}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--color-primary)' : 'var(--color-text-muted)', padding: '0', display: 'flex' }}
              >
                {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
              </button>
            </div>

            {/* Watchlist badges */}
            {result.watchlists.map((wl) => (
              <span key={wl} className="badge-base badge-secondary">{wl}</span>
            ))}
            <span className="badge-base badge-tertiary">
              <Globe size={9} />{result.jurisdiction}
            </span>
          </div>

          {/* Threat vector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.75rem' }}>
            <AlertTriangle size={12} color="var(--color-secondary)" style={{ flexShrink: 0 }} />
            <div className="label-sm" style={{ color: 'var(--color-text-faint)' }}>THREAT VECTOR:</div>
            <span className="code-terminal" style={{ color: 'var(--color-secondary)', fontWeight: 600 }}>{result.threatVector}</span>
          </div>

        </div>
      </div>
    </div>
  );
}

