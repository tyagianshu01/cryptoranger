import React from 'react';
import { FileText, Code, Lock, AlertTriangle, Clock, Wallet, ExternalLink, TrendingUp } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { PeelRatioChart } from './PeelRatioChart';

export function InspectorDossier() {
  const selectedNode = useStore((s) => s.selectedNode);
  const traceResult  = useStore((s) => s.traceResult);
  const result       = traceResult;

  const getRiskStyle = (score: number) => {
    if (score >= 80) return { bg: 'var(--color-danger-container)',  fg: 'var(--color-danger)',  border: 'rgba(239,68,68,0.3)' };
    if (score >= 50) return { bg: 'var(--color-warn-container)',    fg: 'var(--color-warn)',    border: 'rgba(245,158,11,0.3)' };
    return               { bg: 'var(--color-success-container)',  fg: 'var(--color-success)', border: 'rgba(34,197,94,0.3)'  };
  };

  const nodeClusters = result?.clusters.filter(
    (c) => selectedNode && c.walletIds.includes(selectedNode.id)
  ) ?? [];

  const vaspMatch = result?.vaspMatches.find((v) => v.nodeId === selectedNode?.id);
  const hasPeel = selectedNode?.type === 'suspect' || selectedNode?.type === 'intermediate';
  const peelHops = hasPeel ? (result?.peelChain ?? []) : [];

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minWidth: 0, borderRadius: 0, borderRight: 'none', borderTop: 'none', borderBottom: 'none' }}>
      <div className="panel-header" style={{ borderRadius: 0 }}>
        <Wallet size={12} color="var(--color-primary)" />
        <span className="label-md" style={{ color: 'var(--color-primary)' }}>Node Inspector</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0.75rem', background: 'var(--color-surface-2)' }}>
        {!selectedNode ? (
          <div style={{ textAlign: 'center', paddingTop: '3rem' }}>
            <div style={{ color: 'var(--color-text-faint)', marginBottom: '0.625rem' }}>
              <Wallet size={28} style={{ margin: '0 auto', opacity: 0.3 }} />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-faint)' }}>
              Click a node or edge<br />to inspect its data
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>

            {/* Address block */}
            <div className="panel" style={{ padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                <span className="label-sm" style={{ color: 'var(--color-text-faint)' }}>Address</span>
                <span className="badge-base badge-neutral">{selectedNode.chain}</span>
              </div>
              <div className="code-terminal" style={{ color: 'var(--color-primary)', wordBreak: 'break-all', fontSize: '11px', fontWeight: 600, lineHeight: 1.5 }}>
                {selectedNode.address}
              </div>
              {selectedNode.ensName && (
                <div className="code-terminal" style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem', fontSize: '11px' }}>
                  ↳ {selectedNode.ensName}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.625rem', flexWrap: 'wrap' }}>
                {(() => {
                  const rs = getRiskStyle(selectedNode.riskScore);
                  return (
                    <span className="badge-base" style={{ background: rs.bg, color: rs.fg, border: `1px solid ${rs.border}` }}>
                      Risk: {selectedNode.riskScore}/100
                    </span>
                  );
                })()}
                {selectedNode.flagged && (
                  <span className="badge-base badge-danger">
                    <AlertTriangle size={9} /> Flagged
                  </span>
                )}
              </div>
            </div>

            {/* Metrics */}
            <div className="panel" style={{ padding: '0.75rem' }}>
              <div className="label-sm" style={{ color: 'var(--color-text-faint)', marginBottom: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.25rem' }}>
                Metrics
              </div>
              <MetaRow label="Type"        value={selectedNode.type.replace('_', ' ')} />
              <MetaRow label="Balance"     value={`${selectedNode.balance.toFixed(4)} ${selectedNode.chain || (traceResult?.chain || 'ETH')}`} highlight />
              <MetaRow label="USD value"   value={`$${selectedNode.balanceUsd.toLocaleString()}`} />
              <MetaRow label="Tx count"    value={selectedNode.txCount.toLocaleString()} />
              <MetaRow label="Hop depth"   value={`${selectedNode.hopDepth}`} />
              <MetaRow label="First seen"  value={new Date(selectedNode.firstSeen).toLocaleDateString('en-GB')} />
              <MetaRow label="Last active" value={timeSince(selectedNode.lastActive)} />

              <button
                onClick={() => {
                  const isSol = selectedNode.chain === 'SOL' || !selectedNode.address.startsWith('0x');
                  useStore.getState().runTrace(selectedNode.address, 1, isSol ? 5 : 100);
                }}
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '0.75rem', fontSize: '11px' }}
              >
                <ExternalLink size={11} /> Trace this wallet
              </button>
            </div>

            {/* Peel chain */}
            {peelHops.length > 0 && (
              <div className="panel" style={{ padding: '0.75rem', borderLeft: '2px solid var(--color-primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span className="label-sm" style={{ color: 'var(--color-primary)' }}>Peel chain detected</span>
                  <span className="badge-base badge-primary">96.7% confidence</span>
                </div>
                <div className="code-terminal" style={{ color: 'var(--color-text-faint)', fontSize: '10px', marginBottom: '0.5rem' }}>
                  Funds forwarded through a chain of intermediate wallets to obscure origin.
                </div>
                <PeelRatioChart hops={peelHops} />
              </div>
            )}

            {/* VASP match */}
            {vaspMatch && (
              <div className="panel" style={{ padding: '0.75rem', background: 'var(--color-success-container)', borderColor: 'rgba(34,197,94,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span className="label-sm" style={{ color: 'var(--color-success)' }}>Exchange identified</span>
                  <span className="badge-base badge-success">{vaspMatch.confidence}% conf.</span>
                </div>
                <MetaRow label="Exchange"     value={vaspMatch.exchange} />
                <MetaRow label="Jurisdiction" value={vaspMatch.jurisdiction} />
                {vaspMatch.frozen && (
                  <div style={{ marginTop: '0.375rem' }}>
                    <span className="badge-base badge-danger"><Lock size={9} /> Assets frozen — {vaspMatch.freezeAuthority}</span>
                  </div>
                )}
              </div>
            )}

            {/* Hash */}
            {result && (
              <div style={{ marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--color-border)', textAlign: 'center' }}>
                <div className="label-sm" style={{ color: 'var(--color-text-faint)', marginBottom: '0.25rem' }}>Chain-of-custody hash</div>
                <div className="code-terminal" style={{ color: 'var(--color-text-faint)', wordBreak: 'break-all', fontSize: '9px', opacity: 0.6 }}>
                  {result.chainOfCustodyHash}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MetaRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', gap: '0.5rem' }}>
      <span className="code-terminal" style={{ color: 'var(--color-text-faint)', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span className="code-terminal" style={{ color: highlight ? 'var(--color-primary)' : 'var(--color-text)', textAlign: 'right', fontWeight: highlight ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{value}</span>
    </div>
  );
}

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
