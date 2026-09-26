import React from 'react';
import { useStore } from '../../store/useStore';
import { Printer, X } from 'lucide-react';

export function DossierEditorOverlay({ onClose }: { onClose: () => void }) {
    const traceResult = useStore((s) => s.traceResult);
    if (!traceResult) return null;

    // Isolate Top 5 Threats (if any are > 0 risk, otherwise just show highest ones)
    const sortedLedger = [...(traceResult.ledgerTransactions || [])].sort((a, b) => b.riskScore - a.riskScore);
    const hasFlags = sortedLedger.some(t => t.riskScore >= 75);

    // "top 5 if no risky account found if they are found then list them all in report"
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
                display: 'flex', gap: '1rem', marginBottom: '2rem', width: '100%', maxWidth: '210mm', justifyContent: 'flex-end'
            }}>
                <button onClick={handlePrint} style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#DC2626',
                    color: 'white', padding: '0.75rem 1.5rem', border: 'none', borderRadius: '4px',
                    fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '14px'
                }}>
                    <Printer size={18} /> APPROVE & DOWNLOAD PDF
                </button>
                <button onClick={onClose} style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--color-surface-3)',
                    color: 'var(--color-text)', padding: '0.75rem 1.5rem', border: 'none', borderRadius: '4px',
                    fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '14px'
                }}>
                    <X size={18} /> CANCEL
                </button>
            </div>

            {/* A4 Document Area */}
            <div id="dossier-print-area" style={{
                width: '210mm', minHeight: '297mm', background: 'white', color: 'black',
                padding: '20mm', boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                fontFamily: 'Times New Roman, serif', position: 'relative'
            }}>

                {/* Letterhead Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid black', paddingBottom: '1rem', marginBottom: '2rem' }}>
                    <div style={{ flex: 1 }}>
                        <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 4px 0', textTransform: 'uppercase' }}>Government of India</h1>
                        <h2 style={{ fontSize: '14px', fontWeight: 'normal', margin: 0 }}>Ministry of Home Affairs<br />Financial Intelligence Unit — Cyber Forensics Division</h2>
                    </div>
                    <div>
                        <img
                            src="/images.jpg"
                            alt="Ashoka Stambh"
                            style={{ height: '70px', objectFit: 'contain' }}
                        />
                    </div>
                </div>

                {/* Case Metadata */}
                <h3 contentEditable suppressContentEditableWarning style={{ fontSize: '16px', textDecoration: 'underline', textAlign: 'center', margin: '0 0 2rem 0' }}>
                    ASSET PRESERVATION NOTICE & THREAT INTELLIGENCE DOSSIER
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem', fontSize: '13px' }}>
                    <div><b>Case ID:</b> <span contentEditable suppressContentEditableWarning>{traceResult.caseId}</span></div>
                    <div><b>Date Generated:</b> {new Date().toLocaleString()}</div>
                    <div><b>Investigating Officer:</b> <span contentEditable suppressContentEditableWarning>________________________</span></div>
                    <div><b>Chain-of-Custody Hash:</b> <br /><span style={{ fontSize: '10px', fontFamily: 'Courier New' }}>{traceResult.chainOfCustodyHash}</span></div>
                </div>

                {/* Edit Section */}
                <div contentEditable suppressContentEditableWarning style={{ marginBottom: '2rem', fontSize: '13px', lineHeight: '1.6', outline: 'none' }}>
                    <p>
                        <b>SUBJECT SUMMARY:</b> The Directorate has authorized a structural blockchain trace terminating at Root Identity Hash <b>{traceResult.rootAddress}</b>.
                        The forensic trace has mathematically mapped up to {traceResult.hops} network hops encompassing roughly ${traceResult.totalValueUsd.toLocaleString()} USD in chronological transfer volume.
                        Please amend investigatory notes here directly prior to dossier extraction.
                    </p>
                </div>

                {/* Threat Ledger Table */}
                <div style={{ marginBottom: '2rem' }}>
                    <h4 contentEditable suppressContentEditableWarning style={{ fontSize: '14px', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '1rem' }}>
                        APPENDIX A: FORENSIC COUNTERPARTY THREAT VECTORS
                    </h4>
                    <p style={{ fontSize: '11px', marginBottom: '1rem', fontStyle: 'italic' }}>
                        {hasFlags
                            ? "All counterparties transacting with the target node that exceeded the Tier-1 Risk Index (>= 75) are cataloged below."
                            : "No anomalies detected exceeding Tier-1 threshold. The Top 5 highest structural connections by velocity are cataloged below."}
                    </p>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: 'Courier New', border: '1px solid black' }}>
                        <thead>
                            <tr style={{ background: '#f0f0f0' }}>
                                <th style={{ border: '1px solid black', padding: '6px', textAlign: 'left' }}>ORIGIN/DESTINATION HASH</th>
                                <th style={{ border: '1px solid black', padding: '6px', textAlign: 'left' }}>AMOUNT</th>
                                <th style={{ border: '1px solid black', padding: '6px', textAlign: 'left' }}>TIMESTAMP</th>
                                <th style={{ border: '1px solid black', padding: '6px', textAlign: 'center' }}>RISK SCORE</th>
                            </tr>
                        </thead>
                        <tbody>
                            {riskyAccounts.map((tx, idx) => {
                                const subjectAddr = tx.fromAddress.toLowerCase() === traceResult.rootAddress.toLowerCase() ? tx.toAddress : tx.fromAddress;
                                return (
                                    <tr key={idx}>
                                        <td style={{ border: '1px solid black', padding: '6px' }}>{subjectAddr}</td>
                                        <td style={{ border: '1px solid black', padding: '6px' }}>{tx.amountEth.toFixed(4)} ETH</td>
                                        <td style={{ border: '1px solid black', padding: '6px' }}>{new Date(tx.timestamp).toLocaleString()}</td>
                                        <td style={{ border: '1px solid black', padding: '6px', textAlign: 'center', fontWeight: tx.riskScore >= 75 ? 'bold' : 'normal', color: tx.riskScore >= 75 ? 'red' : 'black' }}>
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
                    <h4 contentEditable suppressContentEditableWarning style={{ fontSize: '14px', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '1rem' }}>
                        APPENDIX B: DETECTED LIQUIDATION EXCHANGES (OFFRAMPS)
                    </h4>
                    {traceResult.vaspMatches.length > 0 ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: 'Courier New', border: '1px solid black' }}>
                            <thead>
                                <tr style={{ background: '#f0f0f0' }}>
                                    <th style={{ border: '1px solid black', padding: '6px', textAlign: 'left' }}>EXCHANGE NAME</th>
                                    <th style={{ border: '1px solid black', padding: '6px', textAlign: 'left' }}>VASP WALLET</th>
                                    <th style={{ border: '1px solid black', padding: '6px', textAlign: 'center' }}>DEPOSITED ETH</th>
                                </tr>
                            </thead>
                            <tbody>
                                {traceResult.vaspMatches.map((v, idx) => {
                                    const node = traceResult.nodes.find(n => n.id === v.nodeId);
                                    return (
                                        <tr key={idx}>
                                            <td style={{ border: '1px solid black', padding: '6px' }}>{v.exchange}</td>
                                            <td style={{ border: '1px solid black', padding: '6px' }}>{node?.address || v.nodeId}</td>
                                            <td style={{ border: '1px solid black', padding: '6px', textAlign: 'center' }}>{node?.balance ? node.balance.toFixed(4) : "—"}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : (
                        <p style={{ fontSize: '11px', fontStyle: 'italic' }}>No known Virtual Asset Service Providers (Exchanges) detected in immediate trace radius.</p>
                    )}
                </div>

                {/* Footer Signature */}
                <div style={{ position: 'absolute', bottom: '20mm', right: '20mm', textAlign: 'center', marginTop: '40px' }}>
                    <p style={{ margin: 0, fontSize: '12px' }}>___________________________________</p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>Authorized Digital Signature</p>
                </div>

            </div>
        </div>
    );
}
