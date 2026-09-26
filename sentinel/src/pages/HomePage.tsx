import React from 'react';
import {
    Network, Terminal, FileText, Shield, Activity,
    Lock, Cpu, Layers, Eye, Zap, ArrowRight, Globe, Database
} from 'lucide-react';
import { useStore } from '../store/useStore';

const CAPABILITIES = [
    {
        icon: <Network size={28} />,
        title: 'On-Chain Graph Topology',
        description: 'Visualize multi-hop fund flows, peel chains, and mixer obfuscation patterns using force-directed graph algorithms with real-time Neo4j traversal.',
        accent: 'var(--color-navy)',
        page: 'graph-explorer' as const,
        cta: 'LAUNCH EXPLORER'
    },
    {
        icon: <Terminal size={28} />,
        title: 'AI-Powered Cypher Sandbox',
        description: 'Natural language to read-only Neo4j queries. Hardware-level mutation lock prevents database tampering during adversarial graph interrogation.',
        accent: 'var(--color-india-green)',
        page: 'cypher-console' as const,
        cta: 'OPEN TERMINAL'
    },
    {
        icon: <FileText size={28} />,
        title: 'Forensic Ledger Audit Trail',
        description: 'Two-pass taint contagion algorithm propagates risk coefficients across the entire transaction subgraph, scoring counterparty exposure at each hop.',
        accent: 'var(--color-saffron)',
        page: 'linked-transactions' as const,
        cta: 'VIEW LEDGER'
    },
    {
        icon: <Shield size={28} />,
        title: 'Government Dossier Generation',
        description: 'WYSIWYG intelligence reports with auto-injected threat vectors and VASP offramp data formatted for law enforcement submission under IT Act framework.',
        accent: 'var(--color-secondary)',
        page: 'graph-explorer' as const,
        cta: 'GENERATE REPORT'
    },
];

const STATS = [
    { label: 'BLOCKCHAIN NODES INDEXED', value: '412M+', icon: <Database size={14} /> },
    { label: 'TAINT CONTAGION ENGINE', value: 'ACTIVE', icon: <Activity size={14} />, ok: true },
    { label: 'DATABASE MUTATION LOCK', value: 'ENGAGED', icon: <Lock size={14} />, ok: true },
    { label: 'ML FRAUD CLASSIFIER', value: 'LightGBM v3.1', icon: <Cpu size={14} /> },
    { label: 'CLEARANCE LEVEL', value: 'LAW ENFORCEMENT', icon: <Eye size={14} /> },
];

export function HomePage() {
    const setActivePage = useStore((s) => s.setActivePage);

    return (
        <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--color-base)' }}>

            {/* SECTION 1: Hero Banner */}
            <div style={{
                position: 'relative', overflow: 'hidden',
                background: 'linear-gradient(135deg, #1B2B48 0%, #0F172A 50%, #1B2B48 100%)',
                padding: '4rem 3rem 3.5rem', minHeight: '340px',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
            }}>
                {/* Animated hexagonal mesh background */}
                <div className="hero-mesh" style={{ position: 'absolute', inset: 0, opacity: 0.08, pointerEvents: 'none' }}>
                    {Array.from({ length: 18 }).map((_, i) => (
                        <div key={i} className="hex-float" style={{
                            position: 'absolute',
                            width: `${20 + (i % 4) * 12}px`, height: `${20 + (i % 4) * 12}px`,
                            border: '1.5px solid rgba(255,255,255,0.6)',
                            borderRadius: '4px',
                            transform: `rotate(45deg)`,
                            left: `${(i * 7.3) % 95}%`,
                            top: `${(i * 13.7) % 85}%`,
                            animationDelay: `${i * 0.4}s`,
                        }} />
                    ))}
                </div>

                {/* Content */}
                <div style={{ position: 'relative', zIndex: 1, maxWidth: '720px' }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                        padding: '0.375rem 0.875rem', borderRadius: '4px', marginBottom: '1.5rem',
                    }}>
                        <Zap size={12} color="#D0723A" />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'rgba(255,255,255,0.7)', letterSpacing: '1px' }}>
                            SENTINEL DEFENSE SYSTEM · ACTIVE
                        </span>
                    </div>

                    <h1 style={{
                        fontFamily: 'var(--font-serif)', fontSize: '32px', fontWeight: 700,
                        color: '#FFFFFF', lineHeight: 1.25, margin: '0 0 1rem',
                        letterSpacing: '-0.01em',
                    }}>
                        Blockchain Threat Intelligence<br />& Forensic Trace Engine
                    </h1>

                    <p style={{
                        fontFamily: 'var(--font-sans)', fontSize: '15px', color: 'rgba(255,255,255,0.55)',
                        lineHeight: 1.7, margin: '0 0 2rem', maxWidth: '600px',
                    }}>
                        AI-Powered On-Chain Surveillance · Peel Chain Detection · VASP Offramp Mapping ·
                        Graph Taint Contagion · Hardware-Enforced Read-Only Query Sandbox
                    </p>

                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => setActivePage('graph-explorer')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.75rem 1.5rem', borderRadius: '4px', border: 'none',
                                background: '#D0723A', color: '#FFFFFF', cursor: 'pointer',
                                fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px',
                                letterSpacing: '0.5px', transition: 'all 0.2s ease',
                            }}
                        >
                            LAUNCH GRAPH EXPLORER <ArrowRight size={14} />
                        </button>
                        <button
                            onClick={() => setActivePage('cypher-console')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.75rem 1.5rem', borderRadius: '4px',
                                border: '1px solid rgba(255,255,255,0.2)', background: 'transparent',
                                color: 'rgba(255,255,255,0.8)', cursor: 'pointer',
                                fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: '13px',
                                letterSpacing: '0.5px', transition: 'all 0.2s ease',
                            }}
                        >
                            <Terminal size={14} /> INITIALIZE CYPHER TERMINAL
                        </button>
                    </div>
                </div>
            </div>

            {/* SECTION 2: Live Telemetry Strip */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
                borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-surface-2)',
            }}>
                {STATS.map((stat, i) => (
                    <div key={i} style={{
                        padding: '1.25rem 1.5rem',
                        borderRight: i < STATS.length - 1 ? '1px solid var(--color-border)' : 'none',
                        display: 'flex', flexDirection: 'column', gap: '0.375rem',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <span style={{ color: 'var(--color-text-faint)' }}>{stat.icon}</span>
                            <span style={{
                                fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-faint)',
                                letterSpacing: '0.5px',
                            }}>
                                {stat.label}
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {'ok' in stat && (
                                <div style={{
                                    width: '6px', height: '6px', borderRadius: '50%',
                                    background: '#16A34A', boxShadow: '0 0 6px rgba(22,163,74,0.6)',
                                }} />
                            )}
                            <span style={{
                                fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 600,
                                color: 'var(--color-text)',
                            }}>
                                {stat.value}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* SECTION 3: Capability Bento Grid */}
            <div style={{ padding: '3rem', background: 'var(--color-surface-1)' }}>
                <div style={{ marginBottom: '2rem' }}>
                    <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-saffron)',
                        letterSpacing: '1.5px', fontWeight: 600,
                    }}>
                        CORE CAPABILITIES
                    </span>
                    <h2 style={{
                        fontFamily: 'var(--font-serif)', fontSize: '24px', fontWeight: 600,
                        color: 'var(--color-text)', margin: '0.5rem 0 0', letterSpacing: '-0.01em',
                    }}>
                        Intelligence Suite Modules
                    </h2>
                </div>

                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '1.25rem',
                }}>
                    {CAPABILITIES.map((cap, i) => (
                        <div key={i} style={{
                            background: 'var(--color-surface-base, var(--color-base))',
                            border: '1px solid var(--color-border)',
                            borderRadius: '8px', padding: '2rem',
                            display: 'flex', flexDirection: 'column', gap: '1rem',
                            transition: 'box-shadow 0.25s ease, transform 0.25s ease',
                            cursor: 'pointer',
                        }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.boxShadow = '0 8px 32px rgba(27,43,72,0.08)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.boxShadow = 'none';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                            onClick={() => setActivePage(cap.page)}
                        >
                            <div style={{
                                width: '48px', height: '48px', borderRadius: '10px',
                                background: `${cap.accent}12`, border: `1px solid ${cap.accent}25`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: cap.accent,
                            }}>
                                {cap.icon}
                            </div>
                            <div>
                                <h3 style={{
                                    fontFamily: 'var(--font-sans)', fontSize: '16px', fontWeight: 600,
                                    color: 'var(--color-text)', margin: '0 0 0.5rem',
                                }}>
                                    {cap.title}
                                </h3>
                                <p style={{
                                    fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-faint)',
                                    lineHeight: 1.65, margin: 0,
                                }}>
                                    {cap.description}
                                </p>
                            </div>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '0.375rem',
                                fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600,
                                color: cap.accent, letterSpacing: '0.5px', marginTop: 'auto',
                            }}>
                                {cap.cta} <ArrowRight size={12} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* SECTION 4: Threat Intelligence Overview */}
            <div style={{
                padding: '2.5rem 3rem', background: 'var(--color-surface-2)',
                borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)',
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '3rem' }}>
                    <div style={{ flex: '0 0 320px' }}>
                        <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-saffron)',
                            letterSpacing: '1.5px', fontWeight: 600,
                        }}>
                            RISK CLASSIFICATION MATRIX
                        </span>
                        <h2 style={{
                            fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 600,
                            color: 'var(--color-text)', margin: '0.5rem 0 0.75rem',
                        }}>
                            Dual-Validation Pipeline
                        </h2>
                        <p style={{
                            fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-faint)',
                            lineHeight: 1.65, margin: 0,
                        }}>
                            Risk scores are computed through a two-layer validation framework. Graph-based heuristic
                            analysis traces fund flow topology, while the LightGBM ML classifier profiles wallet
                            behavior patterns to minimize false positives across high-volume blockchain forensics.
                        </p>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', justifyContent: 'center' }}>
                        {/* Gradient Risk Bar */}
                        <div style={{
                            height: '12px', borderRadius: '6px', overflow: 'hidden',
                            background: 'linear-gradient(90deg, #16A34A 0%, #2B6D45 25%, #D0723A 55%, #A62424 80%, #8B1A1A 100%)',
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
                        }} />
                        <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-faint)',
                            letterSpacing: '0.5px',
                        }}>
                            <span>LEGITIMATE</span>
                            <span>LOW RISK</span>
                            <span>MODERATE</span>
                            <span>HIGH THREAT</span>
                            <span>CRITICAL</span>
                        </div>

                        <div style={{
                            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginTop: '1rem',
                        }}>
                            {[
                                { label: 'HEURISTIC ENGINE', desc: 'Peel chain / mixer detection' },
                                { label: 'ML CLASSIFIER', desc: 'LightGBM behavioral profiling' },
                                { label: 'TAINT CONTAGION', desc: 'Two-pass risk propagation' },
                            ].map((item, i) => (
                                <div key={i} style={{
                                    padding: '0.75rem', borderRadius: '6px',
                                    border: '1px solid var(--color-border)', background: 'var(--color-surface-1)',
                                }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-faint)', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>
                                        {item.label}
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                        {item.desc}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* SECTION 5: Classification Footer */}
            <div style={{
                background: '#1B2B48', padding: '2rem 3rem',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <div>
                    <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'rgba(255,255,255,0.4)',
                        letterSpacing: '1px', lineHeight: 1.8,
                    }}>
                        RESTRICTED SYSTEM — CLASSIFIED UNDER INFORMATION TECHNOLOGY ACT, 2000
                    </div>
                    <div style={{
                        fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'rgba(255,255,255,0.25)',
                        marginTop: '0.25rem',
                    }}>
                        HOME MINISTRY AND CENTRAL AFFAIRS · FINANCIAL INTELLIGENCE UNIT
                    </div>
                </div>
                <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: '11px',
                    color: 'rgba(255,255,255,0.3)', textAlign: 'right',
                }}>
                    SENTINEL v3.1 · NODE TELEMETRY ACTIVE
                </div>
            </div>
        </div>
    );
}
