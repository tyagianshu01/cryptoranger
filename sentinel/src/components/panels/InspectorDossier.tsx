import React from 'react';
import { FileText, Code, Lock, AlertTriangle, Clock, Wallet, ExternalLink, ShieldAlert } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { PeelRatioChart } from './PeelRatioChart';

export function InspectorDossier() {
  const selectedNode = useStore((s) => s.selectedNode);
  const traceResult = useStore((s) => s.traceResult);
  const result = traceResult;

  const getRiskStyle = (score: number) => {
    if (score >= 80) return { bg: 'var(--color-secondary-container)', fg: 'var(--color-secondary)', border: '#FECACA' };
    if (score >= 50) return { bg: '#FEF3C7', fg: '#D97706', border: '#FDE68A' };
    return { bg: 'var(--color-primary-container)', fg: 'var(--color-primary)', border: '#BAE6FD' };
  };

  const nodeClusters = result?.clusters.filter(
    (c) => selectedNode && c.walletIds.includes(selectedNode.id)
  ) ?? [];

  const vaspMatch = result?.vaspMatches.find((v) => v.nodeId === selectedNode?.id);
  const hasPeel = selectedNode?.type === 'suspect' || selectedNode?.type === 'intermediate';
  const peelHops = hasPeel ? (result?.peelChain ?? []) : [];
  // PDF Generator moved to bottom strip

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minWidth: 0, borderRadius: 0, borderRight: 'none', borderTop: 'none', borderBottom: 'none' }}>
      <div className="panel-header" style={{ borderRadius: 0, background: 'var(--color-lowest)' }}>
        <Wallet size={13} color="var(--color-tertiary)" />
        <span className="label-md" style={{ color: 'var(--color-tertiary)' }}>FORENSIC INSPECTOR</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0.875rem', background: 'var(--color-surface-2)' }}>
        {!selectedNode ? (
          <div style={{ textAlign: 'center', paddingTop: '3rem' }}>
            <div style={{ color: 'var(--color-surface-4)', marginBottom: '0.75rem' }}>
              <ShieldAlert size={32} style={{ margin: '0 auto' }} />
            </div>
            <div className="body-md" style={{ color: 'var(--color-text-muted)' }}>
              SELECT A NODE OR EDGE<br />TO VIEW TELEMETRY
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Core Identification Block */}
            <div className="panel" style={{ padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span className="label-sm" style={{ color: 'var(--color-text-faint)' }}>TARGET IDENTIFIER</span>
                <span className="badge-base badge-neutral">{selectedNode.chain} NETWORK</span>
              </div>
              <div className="code-terminal" style={{ color: 'var(--color-tertiary)', wordBreak: 'break-all', fontSize: '11px', fontWeight: 600 }}>
                {selectedNode.address}
              </div>
              {selectedNode.ensName && (
                <div className="code-terminal" style={{ color: 'var(--color-primary)', marginTop: '0.25rem' }}>
                  ↳ {selectedNode.ensName}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                {(() => {
                  const rs = getRiskStyle(selectedNode.riskScore);
                  return (
                    <span className="badge-base" style={{ background: rs.bg, color: rs.fg, border: `1px solid ${rs.border}` }}>
                      RISK SCORE: {selectedNode.riskScore}/100
                    </span>
                  );
                })()}
                {selectedNode.flagged && (
                  <span className="badge-base badge-secondary">
                    <AlertTriangle size={9} /> FLAGGED
                  </span>
                )}
              </div>
            </div>

            {/* Telemetry Metrics */}
            <div className="panel" style={{ padding: '0.75rem' }}>
              <div className="label-sm" style={{ color: 'var(--color-text-faint)', marginBottom: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.25rem' }}>AGGREGATE METRICS</div>
              <MetaRow label="RESOLUTION" value={selectedNode.type.toUpperCase()} />
              <MetaRow label="TOTAL HELD" value={`${selectedNode.balance.toFixed(4)} ETH`} highlight />
              <MetaRow label="USD VALUE" value={`$${selectedNode.balanceUsd.toLocaleString()}`} />
              <MetaRow label="TX TRACED" value={selectedNode.txCount.toLocaleString()} />
              <MetaRow label="DISTANCE" value={`${selectedNode.hopDepth} HOPS`} />
              <MetaRow label="FIRST SEEN" value={new Date(selectedNode.firstSeen).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })} />
              <MetaRow label="LAST ACTIVE" value={timeSince(selectedNode.lastActive)} />

              {/* Quick trace pivot button */}
              <button
                onClick={() => {
                  useStore.getState().runTrace(selectedNode.address, 1);
                }}
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '0.75rem', fontSize: '11px', background: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}
              >
                INITIATE DEEP TRACE ON TARGET
              </button>
            </div>

            {/* Peel heuristics block */}
            {peelHops.length > 0 && (
              <div className="panel" style={{ padding: '0.75rem', borderLeft: '3px solid var(--color-primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                  <span className="label-sm" style={{ color: 'var(--color-text-muted)' }}>HEURISTIC: PEEL CHAIN</span>
                  <span className="badge-base badge-tertiary">96.7% CONF</span>
                </div>
                <div className="code-terminal" style={{ color: 'var(--color-text-faint)', fontSize: '10px', marginBottom: '0.5rem' }}>
                  Automated routing: 90% retained in structural vault, 10% forwarded to VASP intermediaries.
                </div>
                <PeelRatioChart hops={peelHops} />
              </div>
            )}



            {/* Exchange matching */}
            {vaspMatch && (
              <div className="panel" style={{ padding: '0.75rem', background: '#F0FDF4', borderColor: '#BBF7D0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                  <span className="label-sm" style={{ color: '#15803D' }}>VASP IDENTIFIED</span>
                  <span className="badge-base badge-success">{vaspMatch.confidence}% CONF</span>
                </div>
                <MetaRow label="EXCHANGE" value={vaspMatch.exchange} />
                <MetaRow label="JURISDICTION" value={vaspMatch.jurisdiction} />
                {vaspMatch.frozen && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <span className="badge-base" style={{ background: '#FECACA', color: '#B91C1C', borderColor: '#F87171' }}><Lock size={9} /> ASSETS FROZEN — {vaspMatch.freezeAuthority}</span>
                  </div>
                )}
              </div>
            )}


            {/* Chain of Custody */}
            {result && (
              <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--color-border)', textAlign: 'center' }}>
                <div className="label-sm" style={{ color: 'var(--color-text-faint)', marginBottom: '0.25rem' }}>EVIDENCE CHAIN OF CUSTODY :: SECURE HASH</div>
                <div className="code-terminal" style={{ color: 'var(--color-text-muted)', wordBreak: 'break-all', fontSize: '9px', opacity: 0.7 }}>
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
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', gap: '0.5rem' }}>
      <span className="code-terminal" style={{ color: 'var(--color-text-faint)', flexShrink: 0 }}>{label}</span>
      <span className="code-terminal" style={{ color: highlight ? 'var(--color-secondary)' : 'var(--color-tertiary)', textAlign: 'right', fontWeight: highlight ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{value}</span>
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

