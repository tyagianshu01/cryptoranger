import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { Activity, ShieldAlert, ArrowRight, ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export function LinkedTransactionsPage() {
    const result = useStore((s) => s.traceResult);

    const [sortConfig, setSortConfig] = useState<{ key: 'timestamp' | 'amountEth' | 'riskScore', direction: 'asc' | 'desc' }>({
        key: 'timestamp',
        direction: 'desc'
    });

    const handleSort = (key: 'timestamp' | 'amountEth' | 'riskScore') => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const transactions = useMemo(() => {
        if (!result || !result.ledgerTransactions) return [];
        let sortedData = [...result.ledgerTransactions];

        sortedData.sort((a, b) => {
            if (sortConfig.key === 'timestamp') {
                const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return sortConfig.direction === 'asc' ? timeA - timeB : timeB - timeA;
            } else if (sortConfig.key === 'amountEth') {
                return sortConfig.direction === 'asc' ? a.amountEth - b.amountEth : b.amountEth - a.amountEth;
            } else if (sortConfig.key === 'riskScore') {
                return sortConfig.direction === 'asc' ? a.riskScore - b.riskScore : b.riskScore - a.riskScore;
            }
            return 0;
        });

        return sortedData;
    }, [result, sortConfig]);

    const getSortIcon = (key: string) => {
        if (sortConfig.key !== key) return <ArrowUpDown size={14} color="var(--color-text-muted)" style={{ opacity: 0.5 }} />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp size={14} color="var(--color-primary)" />
            : <ArrowDown size={14} color="var(--color-primary)" />;
    };

    if (!result) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--color-surface-1)' }}>
                <Activity size={48} color="var(--color-text-faint)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <h2 className="title-md" style={{ color: 'var(--color-text-muted)' }}>NO INTELLIGENCE GATHERED</h2>
                <p className="body-md" style={{ color: 'var(--color-text-faint)', marginTop: '0.5rem' }}>
                    Execute a trace from the Graph Explorer to view the linked transaction ledger.
                </p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: 'var(--color-surface-1)' }}>
            {/* Page Header */}
            <div style={{ padding: '2rem', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-1)' }}>
                <h1 className="title-lg" style={{ color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <ShieldAlert /> FEDERAL TRANSACTION LEDGER
                </h1>
                <p className="body-md" style={{ color: 'var(--color-text-muted)', marginTop: '0.5rem', maxWidth: '800px' }}>
                    Chronological audit log of all identified transactions linked to the root target node. Risk scores represent the highest maximum threat profiling index between the source and destination wallets.
                </p>
            </div>

            {/* Table Container */}
            <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}>
                <div style={{
                    width: '100%', maxWidth: '1200px',
                    background: 'var(--color-surface-2)',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    overflow: 'hidden',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
                        <thead>
                            <tr>
                                <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('timestamp')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        TIMESTAMP (UTC) {getSortIcon('timestamp')}
                                    </div>
                                </th>
                                <th style={thStyle}>ORIGIN WALLET</th>
                                <th style={thStyle}></th>
                                <th style={thStyle}>DESTINATION WALLET</th>
                                <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('amountEth')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        AMOUNT TRANSFERRED {getSortIcon('amountEth')}
                                    </div>
                                </th>
                                <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('riskScore')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        THREAT RISK SCORE {getSortIcon('riskScore')}
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map((tx, idx) => (
                                <tr key={`${tx.id}-${idx}-${tx.timestamp}`} style={{
                                    background: idx % 2 === 0 ? 'var(--color-surface-1)' : 'var(--color-surface-2)',
                                    borderBottom: idx === transactions.length - 1 ? 'none' : '1px solid var(--color-border)',
                                    transition: 'background 0.2s'
                                }}>
                                    <td style={tdStyle}>
                                        <span className="code-terminal" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                            {tx.timestamp ? new Date(tx.timestamp).toLocaleString('en-GB') : 'UNKNOWN TIME'}
                                        </span>
                                    </td>
                                    <td style={tdStyle}>
                                        <span className="code-terminal" style={{ fontSize: '11px', color: 'var(--color-text)', letterSpacing: '0.05em' }}>
                                            {tx.fromAddress}
                                        </span>
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                        <ArrowRight size={14} color="var(--color-text-faint)" />
                                    </td>
                                    <td style={tdStyle}>
                                        <span className="code-terminal" style={{ fontSize: '11px', color: 'var(--color-text)', letterSpacing: '0.05em' }}>
                                            {tx.toAddress}
                                        </span>
                                    </td>
                                    <td style={tdStyle}>
                                        <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                                            {tx.amountEth.toFixed(4)} ETH
                                        </span>
                                        <div className="label-sm" style={{ color: 'var(--color-text-faint)', marginTop: '4px' }}>
                                            ${tx.amountUsd.toLocaleString()} USD
                                        </div>
                                    </td>
                                    <td style={tdStyle}>
                                        <div style={{
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            color: tx.riskColor, fontWeight: tx.riskScore >= 75 ? 700 : 400, fontSize: '13px',
                                            fontFamily: 'var(--font-mono)'
                                        }}>
                                            {tx.riskScore > 0 ? `${tx.riskScore.toFixed(1)} / 100` : 'UNKNOWN'}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {transactions.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-faint)', fontStyle: 'italic' }}>
                            No linked transactions found in the trace payload.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

const thStyle: React.CSSProperties = {
    padding: '1rem',
    borderBottom: '2px solid var(--color-border)',
    color: 'var(--color-text-muted)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase'
};

const tdStyle: React.CSSProperties = {
    padding: '1.25rem 1rem',
    verticalAlign: 'middle'
};

function formatAddress(addr: string) {
    if (!addr || addr.length < 15) return addr;
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}
