import React, { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';

export function SystemHealthPanel() {
  const [blockHeight, setBlockHeight] = useState(21489102);
  const [gasPrice, setGasPrice] = useState({ base: 18.4, priority: 1.2 });
  const [rpcStatus, setRpcStatus] = useState(99.9);

  useEffect(() => {
    const id = setInterval(() => {
      setBlockHeight((b) => b + (Math.random() > 0.5 ? 1 : 0));
      setGasPrice({ base: 16 + Math.random() * 4, priority: 0.8 + Math.random() * 0.8 });
      setRpcStatus(98.5 + Math.random() * 1.5);
    }, 12000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="panel" style={{ minWidth: 0, borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none', boxShadow: 'none' }}>
      <div className="panel-header" style={{ borderRadius: 0, background: 'var(--color-lowest)', padding: '0.375rem 0.75rem' }}>
        <Activity size={12} color="var(--color-primary)" />
        <span className="label-md" style={{ color: 'var(--color-text-muted)' }}>NETWORK TELEMETRY</span>
      </div>
      <div style={{ padding: '0.4rem 0.75rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', overflow: 'hidden', background: 'var(--color-surface-2)' }}>
        <HealthRow label="HEAD" value={`#${blockHeight.toLocaleString()}`} ok />
        <HealthRow label="GAS" value={`${gasPrice.base.toFixed(1)} / ${gasPrice.priority.toFixed(1)} GWEI`} ok />
        <HealthRow label="RPC" value={`${rpcStatus.toFixed(1)}%`} ok />
      </div>
    </div>
  );
}

function HealthRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', overflow: 'hidden' }}>
      <span className={`status-dot ${ok ? 'status-dot-active' : 'status-dot-error'}`} style={{ flexShrink: 0 }} />
      <span className="label-sm" style={{ color: 'var(--color-text-faint)', flexShrink: 0 }}>{label}:</span>
      <span className="code-terminal" style={{ color: 'var(--color-text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}
