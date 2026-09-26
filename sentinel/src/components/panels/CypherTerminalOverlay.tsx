import React, { useState } from 'react';
import { Terminal, Database, Code, Shield, X, Bot, Play, LayoutGrid, Network } from 'lucide-react';

export function CypherTerminalOverlay({ onClose }: { onClose: () => void }) {
    const [prompt, setPrompt] = useState('');
    const [cypher, setCypher] = useState('');
    const [loadingAI, setLoadingAI] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [results, setResults] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'table' | 'json' | 'graph'>('json');
    const [executionTime, setExecutionTime] = useState<number | null>(null);

    const handleAskAI = async () => {
        if (!prompt) return;
        setLoadingAI(true);
        try {
            const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
            const res = await fetch(`${API_URL}/cypher/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });
            const data = await res.json();
            if (data.query) {
                setCypher(data.query);
            } else {
                alert(data.detail || "Generation failed.");
            }
        } catch (e) {
            console.error(e);
            alert("Failed to reach AI endpoint.");
        } finally {
            setLoadingAI(false);
        }
    };

    const handleExecute = async () => {
        if (!cypher.trim()) return;
        setExecuting(true);
        const start = performance.now();
        try {
            const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
            const res = await fetch(`${API_URL}/cypher/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: cypher })
            });
            const data = await res.json();

            setExecutionTime(Math.round(performance.now() - start));

            if (res.ok) {
                setResults(data);
                if (data.columns && data.columns.length > 0) {
                    setActiveTab('table');
                } else {
                    setActiveTab('json');
                }
            } else {
                alert("SANDBOX REJECTION: " + (data.detail || "Query failed."));
                setResults(data);
                setActiveTab('json');
            }
        } catch (e) {
            console.error(e);
            alert("Failed to reach execution sandbox.");
            setExecutionTime(null);
        } finally {
            setExecuting(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'var(--color-surface-base)', zIndex: 9999, overflow: 'hidden',
            display: 'flex', flexDirection: 'column'
        }}>
            {/* Header */}
            <div style={{
                height: '60px', borderBottom: '1px solid var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 1.5rem', background: 'var(--color-surface-1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Terminal color="var(--color-primary)" />
                    <h2 className="title-md" style={{ color: 'var(--color-text)' }}>NEO4J FORENSIC SANDBOX</h2>
                    <span className="badge-base" style={{ background: '#FECACA', color: '#B91C1C', borderColor: '#F87171', marginLeft: '1rem' }}>
                        <Shield size={10} /> READ-ONLY MUTATION LOCK ACTIVE
                    </span>
                </div>
                <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-faint)', cursor: 'pointer' }}>
                    <X />
                </button>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Left Panel: Inputs */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>

                    {/* Ask AI Section */}
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                        <div className="label-sm" style={{ color: 'var(--color-primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Bot size={14} /> AI QUERY ARCHITECT (TEXT-TO-CYPHER)
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                                type="text"
                                placeholder="E.g., Find top 10 wallets with risk scores > 80..."
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface-1)', color: 'var(--color-text)', fontFamily: 'var(--font-sans)', fontSize: '13px' }}
                                onKeyDown={e => e.key === 'Enter' && handleAskAI()}
                            />
                            <button className="btn btn-secondary" onClick={handleAskAI} disabled={loadingAI}>
                                {loadingAI ? 'ANALYZING...' : 'GENERATE RUNBOOK'}
                            </button>
                        </div>
                    </div>

                    {/* Cypher Editor Section */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
                        <div className="label-sm" style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Code size={14} /> RAW CYPHER CONSOLE (EDITABLE)
                        </div>
                        <textarea
                            value={cypher}
                            onChange={e => setCypher(e.target.value)}
                            spellCheck={false}
                            style={{
                                flex: 1, padding: '1rem', borderRadius: '4px', border: '1px solid var(--color-border)',
                                background: '#0A0A0A', color: '#A5B4FC', fontFamily: 'Courier New, monospace', fontSize: '14px',
                                resize: 'none', outline: 'none', lineHeight: '1.5'
                            }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                            <button
                                className="btn btn-primary"
                                onClick={handleExecute}
                                disabled={executing || !cypher.trim()}
                                style={{ background: 'var(--color-tertiary)', borderColor: 'var(--color-tertiary)', color: '#0F172A', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                            >
                                <Play size={16} /> {executing ? 'EXECUTING TRANSACTION...' : 'EXECUTE QUERY SANDBOX'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Panel: Output & Rendering */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--color-surface-1)' }}>

                    {/* Render Tabs */}
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-2)', padding: '0 1rem' }}>
                        {[
                            { id: 'table', icon: <LayoutGrid size={14} />, label: 'DATA GRID' },
                            { id: 'json', icon: <Code size={14} />, label: 'JSON RAW' },
                            { id: 'graph', icon: <Network size={14} />, label: 'STRUCTURAL' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as 'table' | 'json' | 'graph')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem',
                                    background: 'transparent', border: 'none', borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                                    color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-text-faint)',
                                    cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.5px'
                                }}
                            >
                                {tab.icon} {tab.label}
                            </button>
                        ))}

                        {executionTime !== null && (
                            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', fontSize: '11px', color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)' }}>
                                <Database size={12} style={{ marginRight: '6px' }} /> QUERY RESOLVED IN {executionTime}ms
                            </div>
                        )}
                    </div>

                    {/* Output Canvas */}
                    <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
                        {!results ? (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                                AWAITING CYPHER TRANSACTION...
                            </div>
                        ) : (
                            <>
                                {activeTab === 'json' && (
                                    <pre style={{
                                        padding: '1rem', background: '#0F172A', color: '#38BDF8', borderRadius: '4px',
                                        fontFamily: 'Courier New, monospace', fontSize: '13px', overflow: 'auto', margin: 0
                                    }}>
                                        {JSON.stringify(results, null, 2)}
                                    </pre>
                                )}

                                {activeTab === 'table' && results.columns && results.data && (
                                    <div style={{ overflow: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
                                            <thead>
                                                <tr>
                                                    {results.columns.map((col: string) => (
                                                        <th key={col} style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '11px', letterSpacing: '0.5px' }}>
                                                            {col.toUpperCase()}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {results.data.map((row: any, i: number) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                        {results.columns.map((col: string) => (
                                                            <td key={col} style={{ padding: '0.75rem', color: 'var(--color-text)', fontSize: '12px' }}>
                                                                {typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col])}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                                {results.data.length === 0 && (
                                                    <tr>
                                                        <td colSpan={results.columns.length} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-faint)' }}>
                                                            0 RECORDS RETURNED MATCHING CONDITIONS.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {activeTab === 'graph' && (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: '12px', textAlign: 'center' }}>
                                        Structural topology rendering requires sending payload directly to central canvas. <br />
                                        Use Grid or JSON views to debug path metrics locally.
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
