import React from 'react';
import { useStore } from '../../store/useStore';
import { Printer, X, FileText, Hexagon } from 'lucide-react';

export function DossierEditorOverlay({ onClose }: { onClose: () => void }) {
    const traceResult = useStore((s) => s.traceResult);
    if (!traceResult) return null;

    // Isolate Top 5 Threats (if any are > 0 risk, otherwise just show highest ones)
    const sortedLedger = [...(traceResult.ledgerTransactions || [])].sort((a, b) => b.riskScore - a.riskScore);
    const hasFlags = sortedLedger.some(t => t.riskScore >= 75);

    // User logic: If > 75 exists, list ALL > 75. Otherwise list top 5.
    const riskyAccounts = hasFlags
        ? sortedLedger.filter(t => t.riskScore >= 75)
        : sortedLedger.slice(0, 5);

    const handlePrint = () => {
        window.print();
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.85)', zIndex: 9999, overflowY: 'auto',
            display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem'
        }}>

            {/* Interactive Control Bar (Hidden in PDF) */}
            <div className="no-print" style={{
                display: 'flex', gap: '0.75rem', marginBottom: '2rem', width: '100%', maxWidth: '210mm', justifyContent: 'flex-end'
            }}>
                <button onClick={handlePrint} style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--color-primary)',
                    color: 'var(--color-primary-on)', padding: '0.625rem 1.25rem', border: 'none', borderRadius: 'var(--radius-md)',
                    fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px'
                }}>
                    <Printer size={16} /> Export as PDF
                </button>
                <button onClick={onClose} style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--color-surface-3)',
                    color: 'var(--color-text)', padding: '0.625rem 1.25rem', border: 'none', borderRadius: 'var(--radius-md)',
                    fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px'
                }}>
                    <X size={16} /> Close
                </button>
            </div>

            {/* A4 Document Area */}
            <div id="dossier-print-area" style={{
                width: '210mm', minHeight: '297mm', background: 'white', color: 'black',
                padding: '20mm', boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif', position: 'relative'
            }}>

                {/* Report Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '2rem' }}>
                    <div style={{ flex: 1 }}>
                        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px 0', color: '#0f172a' }}>
                            ChainTrace Analytics
                        </h1>
                        <h2 style={{ fontSize: '13px', fontWeight: 400, margin: 0, color: '#64748b' }}>
                            Blockchain Transaction Intelligence Report
                        </h2>
                    </div>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.5rem 1rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0',
                    }}>
                        <FileText size={16} color="#0d9488" />
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#0d9488', letterSpacing: '0.05em' }}>TRACE REPORT</span>
                    </div>
                </div>

                {/* Report Title */}
                <h3 contentEditable suppressContentEditableWarning style={{
                    fontSize: '15px', fontWeight: 600, textAlign: 'center', margin: '0 0 2rem 0',
                    color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem',
                }}>
                    Wallet Analysis Report
                </h3>

                {/* Case Metadata */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '2rem', fontSize: '12px', color: '#334155' }}>
                    <div><b>Report ID:</b> <span contentEditable suppressContentEditableWarning>{traceResult.caseId}</span></div>
                    <div><b>Date generated:</b> {new Date().toLocaleString()}</div>
                    <div><b>Analyst:</b> <span contentEditable suppressContentEditableWarning>________________________</span></div>
                    <div><b>Data integrity hash:</b> <br /><span style={{ fontSize: '9px', fontFamily: '"JetBrains Mono", monospace', color: '#64748b' }}>{traceResult.chainOfCustodyHash}</span></div>
                </div>

                {/* Summary Section */}
                <div contentEditable suppressContentEditableWarning style={{ marginBottom: '2rem', fontSize: '12px', lineHeight: '1.7', outline: 'none', color: '#334155' }}>
                    <p>
                        <b>Summary:</b> This report documents the results of a blockchain transaction trace
                        originating at wallet address <b style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{traceResult.rootAddress}</b>.
                        The trace explored up to {traceResult.hops} hops from the root address,
                        covering approximately ${traceResult.totalValueUsd.toLocaleString()} USD in aggregate transfer volume.
                        Edit this section to add analyst notes before exporting.
                    </p>
                </div>

                {/* Risk disclaimer */}
                <div style={{
                    padding: '0.625rem 0.875rem', marginBottom: '2rem', borderRadius: '6px',
                    background: '#fef3c7', border: '1px solid #fde68a', fontSize: '11px', color: '#92400e', lineHeight: 1.6,
                }}>
                    <b>Note:</b> Risk scores are computed heuristically from on-chain graph topology and ML behavioral profiling.
                    They are analytical estimates, not definitive assessments. Independent verification is recommended before taking action.
                </div>

                {/* Counterparty Table */}
                <div style={{ marginBottom: '2rem' }}>
                    <h4 contentEditable suppressContentEditableWarning style={{ fontSize: '13px', fontWeight: 600, borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '1rem', color: '#1e293b' }}>
                        Counterparties by Risk Score
                    </h4>
                    <p style={{ fontSize: '10px', marginBottom: '0.75rem', fontStyle: 'italic', color: '#64748b' }}>
                        {hasFlags
                            ? "All counterparties with risk scores ≥ 75 are listed below."
                            : "No counterparties exceeded the high-risk threshold (≥ 75). The top 5 by risk score are shown."}
                    </p>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', fontFamily: '"JetBrains Mono", monospace', border: '1px solid #cbd5e1' }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Counterparty address</th>
                                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Amount</th>
                                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Timestamp</th>
                                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'center', fontWeight: 600, color: '#475569' }}>Risk</th>
                            </tr>
                        </thead>
                        <tbody>
                            {riskyAccounts.map((tx, idx) => {
                                const isSol = traceResult.chain === 'SOL' || !traceResult.rootAddress.startsWith('0x');
                                const matchesRoot = isSol
                                    ? tx.fromAddress === traceResult.rootAddress
                                    : tx.fromAddress.toLowerCase() === traceResult.rootAddress.toLowerCase();
                                const subjectAddr = matchesRoot ? tx.toAddress : tx.fromAddress;
                                return (
                                    <tr key={idx}>
                                        <td style={{ border: '1px solid #cbd5e1', padding: '6px', fontSize: '9px' }}>{subjectAddr}</td>
                                        <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{tx.amountEth.toFixed(4)} {tx.symbol || (isSol ? 'SOL' : 'ETH')}</td>
                                        <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{new Date(tx.timestamp).toLocaleString()}</td>
                                        <td style={{
                                            border: '1px solid #cbd5e1', padding: '6px', textAlign: 'center',
                                            fontWeight: tx.riskScore >= 75 ? 700 : 400,
                                            color: tx.riskScore >= 75 ? '#dc2626' : '#334155',
                                        }}>
                                            {tx.riskScore}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* VASP Table */}
                <div style={{ marginBottom: '2rem' }}>
                    <h4 contentEditable suppressContentEditableWarning style={{ fontSize: '13px', fontWeight: 600, borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '1rem', color: '#1e293b' }}>
                        Detected Exchange Offramps (VASPs)
                    </h4>
                    {traceResult.vaspMatches.length > 0 ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', fontFamily: '"JetBrains Mono", monospace', border: '1px solid #cbd5e1' }}>
                            <thead>
                                <tr style={{ background: '#f1f5f9' }}>
                                    <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Exchange</th>
                                    <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Wallet address</th>
                                    <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'center', fontWeight: 600, color: '#475569' }}>Deposited ETH</th>
                                </tr>
                            </thead>
                            <tbody>
                                {traceResult.vaspMatches.map((v, idx) => {
                                    const node = traceResult.nodes.find(n => n.id === v.nodeId);
                                    return (
                                        <tr key={idx}>
                                            <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{v.exchange}</td>
                                            <td style={{ border: '1px solid #cbd5e1', padding: '6px', fontSize: '9px' }}>{node?.address || v.nodeId}</td>
                                            <td style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'center' }}>{node?.balance ? node.balance.toFixed(4) : "—"}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : (
                        <p style={{ fontSize: '10px', fontStyle: 'italic', color: '#94a3b8' }}>No known exchange deposit wallets were detected within the trace radius.</p>
                    )}
                </div>

                {/* Footer */}
                <div style={{ position: 'absolute', bottom: '20mm', left: '20mm', right: '20mm', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div style={{ fontSize: '9px', color: '#94a3b8', lineHeight: 1.5 }}>
                        Generated by ChainTrace Analytics<br />
                        Risk scores are heuristic estimates derived from on-chain data.
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>___________________________________</p>
                        <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#64748b' }}>Analyst signature</p>
                    </div>
                </div>

            </div>
        </div>
    );
}
