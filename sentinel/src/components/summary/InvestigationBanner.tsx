import React, { useState } from 'react';
import { Copy, CheckCheck, AlertTriangle, TrendingUp } from 'lucide-react';
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
  const riskColor = riskScore >= 80 ? 'var(--color-danger)' : riskScore >= 50 ? 'var(--color-warn)' : 'var(--color-success)';
  const riskLabel = riskScore >= 80 ? 'High' : riskScore >= 50 ? 'Elevated' : 'Low';

  return (
    <div style={{
      background: 'var(--color-surface-1)',
      borderBottom: '1px solid var(--color-border)',
      padding: '0.625rem 1rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>

        {/* Risk gauge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
          <svg width="48" height="48" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="22" fill="none" stroke="var(--color-surface-3)" strokeWidth="5" />
            <circle
              cx="28" cy="28" r="22" fill="none"
              stroke={riskColor}
              strokeWidth="5"
              strokeDasharray={`${(riskScore / 100) * 138.2} 138.2`}
              strokeLinecap="round"
              transform="rotate(-90 28 28)"
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
            <text x="28" y="25" textAnchor="middle" fill={riskColor} fontFamily="var(--font-mono)" fontWeight="800" fontSize="13">{riskScore}</text>
            <text x="28" y="35" textAnchor="middle" fill="var(--color-text-faint)" fontFamily="var(--font-sans)" fontSize="5" letterSpacing="0.06em" style={{ textTransform: 'uppercase' }}>RISK</text>
          </svg>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: riskColor, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {riskLabel} risk
            </div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-faint)' }}>{result.nodes.length} nodes · {result.edges.length} edges</div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '32px', background: 'var(--color-border)', flexShrink: 0 }} />

        {/* Address */}
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div className="label-sm" style={{ color: 'var(--color-text-faint)', marginBottom: '0.25rem' }}>Traced wallet</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="code-terminal" style={{ fontSize: '12px', color: 'var(--color-text)' }}>
              {result.rootAddress.slice(0, 16)}…{result.rootAddress.slice(-8)}
            </span>
            <button
              id="copy-address-btn"
              onClick={handleCopy}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-text-faint)', display: 'flex' }}
              title="Copy full address"
            >
              {copied ? <CheckCheck size={12} color="var(--color-success)" /> : <Copy size={12} />}
            </button>
          </div>
        </div>

        {/* Threat vector */}
        {result.threatVector && (
          <>
            <div style={{ width: '1px', height: '32px', background: 'var(--color-border)', flexShrink: 0 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
              {riskScore >= 50
                ? <AlertTriangle size={12} color="var(--color-warn)" />
                : <TrendingUp size={12} color="var(--color-success)" />}
              <span className="label-sm" style={{ color: 'var(--color-text-faint)' }}>Analysis:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: riskScore >= 50 ? 'var(--color-warn)' : 'var(--color-text-muted)' }}>
                {result.threatVector}
              </span>
            </div>
          </>
        )}

        {/* Watchlist badges */}
        {result.watchlists.length > 0 && result.watchlists.map((wl) => (
          <span key={wl} className="badge-base badge-danger">{wl}</span>
        ))}
      </div>
    </div>
  );
}
