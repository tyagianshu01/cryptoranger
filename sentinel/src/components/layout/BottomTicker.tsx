import React, { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { Activity } from 'lucide-react';

export function BottomTicker() {
  const traceResult = useStore((s) => s.traceResult);
  const [blockHeight, setBlockHeight] = useState(21489102);

  useEffect(() => {
    const id = setInterval(() => setBlockHeight((b) => b + Math.floor(Math.random() * 2)), 12000);
    return () => clearInterval(id);
  }, []);

  const items = [
    { label: 'ETH Block',     value: blockHeight.toLocaleString() },
    { label: 'Data source',   value: 'Etherscan v2 API' },
    { label: 'Graph DB',      value: 'Neo4j 5.x' },
    { label: 'ML engine',     value: 'LightGBM' },
    { label: 'Query mode',    value: 'Read-only enforced' },
    ...(traceResult ? [
      { label: 'Trace ID',  value: traceResult.traceId },
      { label: 'Risk score', value: `${traceResult.riskScore}/100` },
      { label: 'Nodes',     value: traceResult.nodes.length.toString() },
    ] : []),
  ];

  const doubled = [...items, ...items];

  return (
    <div style={{
      height: '22px', overflow: 'hidden',
      background: 'var(--color-surface-2)',
      borderTop: '1px solid var(--color-border)',
      display: 'flex', alignItems: 'center',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0 0.625rem', borderRight: '1px solid var(--color-border)', flexShrink: 0,
      }}>
        <Activity size={10} color="var(--color-primary)" />
        <span className="label-sm" style={{ color: 'var(--color-text-faint)' }}>Live</span>
      </div>
      <div style={{ overflow: 'hidden', flex: 1 }}>
        <div className="ticker-inner" style={{ gap: '2rem' }}>
          {doubled.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
              <span className="label-sm" style={{ color: 'var(--color-text-faint)' }}>{item.label}</span>
              <span className="code-terminal" style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>
                {item.value}
              </span>
              <span style={{ color: 'var(--color-border-strong)', marginLeft: '0.5rem' }}>·</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
