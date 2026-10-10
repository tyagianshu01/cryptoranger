import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import {
  Activity, ShieldAlert, ArrowRight, ArrowDown, ArrowUp, ArrowUpDown,
  Copy, CheckCheck,
} from 'lucide-react';

export function LinkedTransactionsPage() {
  const result = useStore((s) => s.traceResult);

  const [sortConfig, setSortConfig] = useState<{ key: 'timestamp' | 'amountEth' | 'riskScore', direction: 'asc' | 'desc' }>({
    key: 'timestamp',
    direction: 'desc',
  });
  const [copied, setCopied] = useState<string | null>(null);

  const handleSort = (key: 'timestamp' | 'amountEth' | 'riskScore') => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const copyAddr = (addr: string) => {
    navigator.clipboard.writeText(addr).then(() => {
      setCopied(addr);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const transactions = useMemo(() => {
    if (!result || !result.ledgerTransactions) return [];
    let data = [...result.ledgerTransactions];
    data.sort((a, b) => {
      if (sortConfig.key === 'timestamp') {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return sortConfig.direction === 'asc' ? ta - tb : tb - ta;
      } else if (sortConfig.key === 'amountEth') {
        return sortConfig.direction === 'asc' ? a.amountEth - b.amountEth : b.amountEth - a.amountEth;
      } else {
        return sortConfig.direction === 'asc' ? a.riskScore - b.riskScore : b.riskScore - a.riskScore;
      }
    });
    return data;
  }, [result, sortConfig]);

  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key) return <ArrowUpDown size={12} style={{ opacity: 0.3 }} />;
    return sortConfig.direction === 'asc' ? <ArrowUp size={12} color="var(--color-primary)" /> : <ArrowDown size={12} color="var(--color-primary)" />;
  };

  const riskBadge = (score: number) => {
    if (score >= 75) return { bg: 'var(--color-danger-container)', color: 'var(--color-danger)', label: 'High' };
    if (score >= 50) return { bg: 'var(--color-warn-container)',   color: 'var(--color-warn)',   label: 'Med' };
    return               { bg: 'var(--color-success-container)',  color: 'var(--color-success)', label: 'Low' };
  };

  if (!result) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--color-base)' }}>
        <Activity size={40} color="var(--color-text-faint)" style={{ marginBottom: '1rem', opacity: 0.4 }} />
        <h2 style={{ color: 'var(--color-text-muted)', fontSize: '16px', fontWeight: 600, margin: '0 0 0.5rem' }}>No trace data</h2>
        <p style={{ color: 'var(--color-text-faint)', fontSize: '13px', margin: 0 }}>
          Analyze a wallet address to view linked transactions.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: 'var(--color-base)' }}>

      {/* Page Header */}
      <div style={{ padding: '1.5rem 2rem 1rem', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem' }}>
          <ShieldAlert size={16} color="var(--color-primary)" />
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Transactions</h1>
          <span style={{
            marginLeft: '0.5rem', padding: '0.125rem 0.5rem',
            background: 'var(--color-surface-3)', border: '1px solid var(--color-border-strong)',
            borderRadius: '100px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-muted)',
          }}>
            {transactions.length.toLocaleString()} records
          </span>
        </div>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', margin: 0 }}>
          Chronological log of traced transactions. Risk scores reflect the highest computed counterparty score for each transfer.
        </p>
      </div>

      {/* Table */}
      <div style={{ padding: '1.5rem 2rem', flex: 1 }}>
        <div style={{
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-2)' }}>
                <SortTh label="Time" sortKey="timestamp"    getSortIcon={getSortIcon} onClick={handleSort} />
                <th style={thStyle}>From</th>
                <th style={{ ...thStyle, width: '24px' }}></th>
                <th style={thStyle}>To</th>
                <SortTh label="Amount" sortKey="amountEth" getSortIcon={getSortIcon} onClick={handleSort} />
                <SortTh label="Risk"   sortKey="riskScore" getSortIcon={getSortIcon} onClick={handleSort} />
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, idx) => {
                const risk = riskBadge(tx.riskScore);
                return (
                  <tr key={`${tx.id}-${idx}`} className="table-row-hover" style={{
                    borderBottom: idx === transactions.length - 1 ? 'none' : '1px solid var(--color-border)',
                    background: 'var(--color-surface-1)',
                  }}>
                    <td style={tdStyle}>
                      <span className="code-terminal" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        {tx.timestamp ? new Date(tx.timestamp).toLocaleString('en-GB') : '—'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <AddressCell addr={tx.fromAddress} copied={copied} onCopy={copyAddr} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', padding: '0.5rem 0' }}>
                      <ArrowRight size={12} color="var(--color-text-faint)" />
                    </td>
                    <td style={tdStyle}>
                      <AddressCell addr={tx.toAddress} copied={copied} onCopy={copyAddr} />
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600, color: 'var(--color-text)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                        {tx.amountEth.toFixed(4)} {tx.symbol || 'ETH'}
                      </span>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-faint)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                        ≈ ${tx.amountUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </div>
                    </td>

                    <td style={tdStyle}>
                      {tx.riskScore > 0 ? (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                          background: risk.bg, border: `1px solid ${risk.color}40`,
                          borderRadius: 'var(--radius-sm)', padding: '0.125rem 0.5rem',
                        }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: risk.color }}>
                            {tx.riskScore.toFixed(0)}
                          </span>
                          <span className="label-sm" style={{ color: risk.color }}>{risk.label}</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--color-text-faint)', fontSize: '11px' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {transactions.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-faint)', fontSize: '13px' }}>
              No transactions found in the current trace.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddressCell({ addr, copied, onCopy }: { addr: string; copied: string | null; onCopy: (a: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
      <span className="code-terminal" style={{ fontSize: '11px', color: 'var(--color-text)' }}>
        {addr.slice(0, 8)}…{addr.slice(-5)}
      </span>
      <button
        onClick={() => onCopy(addr)}
        title={addr}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-text-faint)', display: 'flex', opacity: 0.7 }}
      >
        {copied === addr ? <CheckCheck size={11} color="var(--color-success)" /> : <Copy size={11} />}
      </button>
    </div>
  );
}

function SortTh({ label, sortKey, getSortIcon, onClick }: {
  label: string;
  sortKey: 'timestamp' | 'amountEth' | 'riskScore';
  getSortIcon: (k: string) => React.ReactNode;
  onClick: (k: 'timestamp' | 'amountEth' | 'riskScore') => void;
}) {
  return (
    <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => onClick(sortKey)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        {label} {getSortIcon(sortKey)}
      </div>
    </th>
  );
}

const thStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  borderBottom: '1px solid var(--color-border)',
  color: 'var(--color-text-muted)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

const tdStyle: React.CSSProperties = {
  padding: '0.875rem 1rem',
  verticalAlign: 'middle',
};
