import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Terminal, Database, Code, Shield, Bot, Play, LayoutGrid, Network } from 'lucide-react';
import { useStore } from '../store/useStore';
import ForceGraph2D from 'react-force-graph-2d';

export function CypherConsole() {
    const [prompt, setPrompt] = useState('');
    const [cypher, setCypher] = useState('');
    const [loadingAI, setLoadingAI] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [results, setResults] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'table' | 'json' | 'graph'>('json');
    const [executionTime, setExecutionTime] = useState<number | null>(null);

    const fgRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [graphDims, setGraphDims] = useState({ width: 800, height: 600 });

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                // Add a small delay/buffer if needed, but synchronous works for force graph updates.
                if (width > 0 && height > 0) {
                    setGraphDims({ width, height });
                }
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [activeTab]);

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

    // Auto-parse arbitrary Neo4j json results into a Generic Graph!
    const graphData = useMemo(() => {
        if (!results || !results.data) return { nodes: [], links: [] };

        const nodeMap = new Map();
        const linkMap = new Map();

        const traverse = (obj: any) => {
            if (!obj || typeof obj !== 'object') return;

            // If it's a Neo4j Node/Edge serialized from our backend:
            if (obj.id && obj.properties !== undefined) {
                if (obj.source && obj.target) {
                    // It's a Relationship
                    if (!linkMap.has(obj.id)) {
                        linkMap.set(obj.id, { id: obj.id, source: obj.source, target: obj.target, name: obj.type });
                    }
                } else if (Array.isArray(obj.labels)) {
                    // It's a Node
                    if (!nodeMap.has(obj.id)) {
                        const isTx = obj.labels.includes("Transaction");
                        nodeMap.set(obj.id, {
                            id: obj.id,
                            name: obj.properties.address || obj.properties.hash || obj.id,
                            val: isTx ? 12 : 16, // Larger scale
                            color: isTx ? '#012B39' : '#DC2626', // Navy for TX, Red for endpoints
                        });
                    }
                }
            }

            // Deep traverse to catch lists or nested dicts (like paths)
            Object.values(obj).forEach(val => traverse(val));
        };

        results.data.forEach((row: any) => traverse(row));

        // Purge any relationships that point to missing nodes! D3's physics engine will instantly crash if source/target is undefined
        const validLinks = Array.from(linkMap.values()).filter(l => nodeMap.has(l.source) && nodeMap.has(l.target));

        return {
            nodes: Array.from(nodeMap.values()),
            links: validLinks
        };
    }, [results]);

    // Force distance apart once physics engine boots
    useEffect(() => {
        if (activeTab === 'graph' && fgRef.current) {
            fgRef.current.d3Force('charge').strength(-500); // Sparse layout
            fgRef.current.d3Force('link').distance(70);
        }
    }, [activeTab, graphData]);

    return (
        <div style={{
            width: '100%', height: '100%',
            background: 'var(--color-surface-base)', overflow: 'hidden',
            display: 'flex', flexDirection: 'column'
        }}>
            {/* Classy Government-Grade Header */}
            <div style={{
                borderBottom: '1px solid var(--color-border)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                padding: '1.5rem 2rem', background: 'var(--color-surface-1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ padding: '0.5rem', background: 'var(--color-surface-2)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                        <Database size={24} color="var(--color-primary)" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 600, color: 'var(--color-text)', letterSpacing: '-0.01em', margin: 0, lineHeight: 1.2 }}>
                            Advanced Graph Query Terminal (Cypher)
                        </h2>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-text-faint)', letterSpacing: '0.5px', marginTop: '0.25rem' }}>
                            NATIONAL CYBER FORENSICS INTELLIGENCE SUITE
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.2)', padding: '0.375rem 0.75rem', borderRadius: '4px' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#EF4444', boxShadow: '0 0 8px #EF4444' }}></div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#DC2626', fontWeight: 600, letterSpacing: '0.5px' }}>
                            READ-ONLY MUTATION LOCK ACTIVE
                        </span>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Left Panel: Inputs */}
                <div style={{ flex: '0 0 45%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>

                    {/* Ask AI Section */}
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                        <div className="label-sm" style={{ color: 'var(--color-primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <Bot size={14} /> AI QUERY ARCHITECT
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <textarea
                                placeholder="E.g., Trace all paths showing capital flight from Wallet X within 3 hops..."
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                style={{ flex: 1, padding: '1rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface-base)', color: 'var(--color-text)', fontFamily: 'var(--font-sans)', fontSize: '14px', minHeight: '60px', resize: 'vertical', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAskAI(); } }}
                            />
                            <button className="btn btn-secondary" onClick={handleAskAI} disabled={loadingAI} style={{ alignSelf: 'flex-end', fontSize: '12px', padding: '0.5rem 1rem' }}>
                                {loadingAI ? 'ANALYZING THREAT INTENT...' : 'GENERATE RUNBOOK'}
                            </button>
                        </div>
                    </div>

                    {/* Cypher Editor Section */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.5rem 2rem' }}>
                        <div className="label-sm" style={{ color: 'var(--color-text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <Terminal size={14} /> RAW CYPHER TERMINAL (EDITABLE)
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0F172A', borderRadius: '6px', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                            <textarea
                                value={cypher}
                                onChange={e => setCypher(e.target.value)}
                                spellCheck={false}
                                style={{
                                    flex: 1, padding: '1.25rem', border: 'none',
                                    background: 'transparent', color: '#38BDF8', fontFamily: 'var(--font-mono)', fontSize: '14px',
                                    resize: 'none', outline: 'none', lineHeight: '1.6'
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                            <button
                                className="btn btn-primary"
                                onClick={handleExecute}
                                disabled={executing || !cypher.trim()}
                                style={{
                                    background: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#FFFFFF',
                                    display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.625rem 1.5rem',
                                    boxShadow: '0 4px 12px rgba(13, 148, 136, 0.2)'
                                }}
                            >
                                <Play size={14} fill="currentColor" /> {executing ? 'EXECUTING TRANSACTION...' : 'EXECUTE QUERY'}
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
                                        fontFamily: 'Courier New, monospace', fontSize: '12px', overflow: 'auto', margin: 0
                                    }}>
                                        {JSON.stringify(results.data, null, 2)}
                                    </pre>
                                )}

                                {activeTab === 'table' && results.columns && results.data && (
                                    <div style={{ overflow: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: 'var(--font-sans)', border: '1px solid var(--color-border)' }}>
                                            <thead>
                                                <tr style={{ background: 'var(--color-surface-2)' }}>
                                                    {results.columns.map((col: string) => (
                                                        <th key={col} style={{ padding: '0.75rem', borderBottom: '2px solid var(--color-border)', borderRight: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '11px', letterSpacing: '0.5px' }}>
                                                            {col.toUpperCase()}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {results.data.map((row: any, i: number) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                        {results.columns.map((col: string) => (
                                                            <td key={col} style={{ padding: '0.75rem', borderRight: '1px solid var(--color-border)', color: 'var(--color-text)', fontSize: '12px' }}>
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
                                    <div ref={containerRef} style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                        {graphData.nodes.length === 0 ? (
                                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                                                NO STRUCTURAL ENTITIES (NODES/EDGES) RETURNED IN QUERY. <br /><br />
                                                (Tip: MATCH (w:Wallet)-[r]-&gt;(tx) RETURN w, r, tx LIMIT 10)
                                            </div>
                                        ) : (
                                            <ForceGraph2D
                                                ref={fgRef}
                                                graphData={graphData}
                                                nodeLabel="name"
                                                nodeColor="color"

                                                // Authentic Neo4j Link Styling
                                                linkColor={() => "rgba(156,163,175,0.8)"}
                                                linkWidth={2}
                                                linkDirectionalArrowLength={4}
                                                linkDirectionalArrowRelPos={1}

                                                // Sizing & Environment
                                                width={graphDims.width}
                                                height={graphDims.height}
                                                backgroundColor="transparent"
                                                d3AlphaDecay={0.05}

                                                // Mimic GraphCanvas.tsx Exact White-Ring Styling
                                                nodeCanvasObjectMode={() => 'after'}
                                                nodeCanvasObject={(node: any, ctx, globalScale) => {
                                                    const r = node.val;

                                                    // Draw Thick White Stroke (Neo4j authentic standard)
                                                    ctx.beginPath();
                                                    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
                                                    ctx.fillStyle = node.color;
                                                    ctx.fill();
                                                    ctx.lineWidth = 2.5 / globalScale;
                                                    ctx.strokeStyle = '#FFFFFF';
                                                    ctx.stroke();

                                                    // Typewriter text labels when zoomed in
                                                    if (globalScale > 1.2) {
                                                        const label = node.name.length > 8 ? node.name.substring(0, 6) + ".." : node.name;
                                                        const fontSize = 10 / globalScale;
                                                        ctx.font = `${fontSize}px "Courier New", monospace`;
                                                        ctx.textAlign = 'center';
                                                        ctx.textBaseline = 'middle';
                                                        ctx.fillStyle = 'var(--color-text-faint)';
                                                        ctx.fillText(label, node.x, node.y + r + (4 / globalScale) + fontSize);
                                                    }
                                                }}
                                            />
                                        )}
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
