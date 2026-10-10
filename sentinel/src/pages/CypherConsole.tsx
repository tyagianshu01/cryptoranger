import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Terminal, Database, Code, Bot, Play, LayoutGrid, Network, X, Loader2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import ForceGraph2D from 'react-force-graph-2d';

export function CypherConsole() {
  const [prompt,        setPrompt]        = useState('');
  const [cypher,        setCypher]        = useState('');
  const [loadingAI,     setLoadingAI]     = useState(false);
  const [executing,     setExecuting]     = useState(false);
  const [results,       setResults]       = useState<any>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [activeTab,     setActiveTab]     = useState<'table' | 'json' | 'graph'>('json');
  const [executionTime, setExecutionTime] = useState<number | null>(null);

  const fgRef        = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphDims, setGraphDims] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) setGraphDims({ width, height });
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
      const res  = await fetch(`${API_URL}/cypher/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data.query) setCypher(data.query);
      else setError(data.detail || 'AI generation failed.');
    } catch (e) {
      setError('Could not reach the AI endpoint. Ensure the backend is running.');
    } finally {
      setLoadingAI(false);
    }
  };

  const handleExecute = async () => {
    if (!cypher.trim()) return;
    setExecuting(true);
    setError(null);
    const start = performance.now();
    try {
      const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
      const res  = await fetch(`${API_URL}/cypher/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cypher }),
      });
      const data = await res.json();
      setExecutionTime(Math.round(performance.now() - start));
      if (res.ok) {
        setResults(data);
        setActiveTab(data.columns?.length > 0 ? 'table' : 'json');
      } else {
        setError(data.detail || 'Query failed.');
        setResults(data);
        setActiveTab('json');
      }
    } catch (e) {
      setError('Could not reach the query endpoint.');
      setExecutionTime(null);
    } finally {
      setExecuting(false);
    }
  };

  const graphData = useMemo(() => {
    if (!results?.data) return { nodes: [], links: [] };
    const nodeMap = new Map();
    const linkMap = new Map();
    const traverse = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      if (obj.id && obj.properties !== undefined) {
        if (obj.source && obj.target) {
          if (!linkMap.has(obj.id)) linkMap.set(obj.id, { id: obj.id, source: obj.source, target: obj.target, name: obj.type });
        } else if (Array.isArray(obj.labels)) {
          if (!nodeMap.has(obj.id)) {
            const isTx = obj.labels.includes('Transaction');
            nodeMap.set(obj.id, {
              id: obj.id,
              name: obj.properties.address || obj.properties.hash || obj.id,
              val: isTx ? 10 : 14,
              color: isTx ? '#818cf8' : '#008257',
            });
          }
        }
      }
      Object.values(obj).forEach((val) => traverse(val));
    };
    results.data.forEach((row: any) => traverse(row));
    const validLinks = Array.from(linkMap.values()).filter((l) => nodeMap.has(l.source) && nodeMap.has(l.target));
    return { nodes: Array.from(nodeMap.values()), links: validLinks };
  }, [results]);

  useEffect(() => {
    if (activeTab === 'graph' && fgRef.current) {
      fgRef.current.d3Force('charge').strength(-500);
      fgRef.current.d3Force('link').distance(70);
    }
  }, [activeTab, graphData]);

  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--color-base)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.875rem 1.5rem', background: 'var(--color-surface-1)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            padding: '0.375rem', background: 'var(--color-surface-2)',
            borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-strong)',
          }}>
            <Database size={16} color="var(--color-primary)" />
          </div>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text)', margin: 0, letterSpacing: '-0.01em' }}>
              Query Console
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)' }}>
              Neo4j Cypher · read-only
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.375rem',
            background: 'var(--color-danger-container)', border: '1px solid rgba(239,68,68,0.3)',
            padding: '0.25rem 0.625rem', borderRadius: 'var(--radius-sm)',
          }}>
            <span className="status-dot status-dot-error" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-danger)', fontWeight: 600, letterSpacing: '0.04em' }}>
              Write operations blocked
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left Panel */}
        <div style={{ flex: '0 0 44%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border)', background: 'var(--color-surface-1)' }}>

          {/* AI natural language section */}
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.75rem' }}>
              <Bot size={13} color="var(--color-primary)" />
              <span className="label-md" style={{ color: 'var(--color-primary)' }}>AI Query Generator</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              <textarea
                placeholder="Describe what you want to query in plain English…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAskAI(); } }}
                style={{
                  padding: '0.75rem', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-strong)',
                  background: 'var(--color-surface-2)', color: 'var(--color-text)',
                  fontFamily: 'var(--font-sans)', fontSize: '13px',
                  minHeight: '64px', resize: 'vertical', outline: 'none', lineHeight: 1.5,
                }}
              />
              <button className="btn btn-tertiary" onClick={handleAskAI} disabled={loadingAI || !prompt.trim()} style={{ alignSelf: 'flex-end', fontSize: '12px' }}>
                {loadingAI ? <><Loader2 size={11} className="spin" /> Generating…</> : 'Generate query'}
              </button>
            </div>
          </div>

          {/* Cypher editor */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.625rem' }}>
              <Terminal size={13} color="var(--color-text-muted)" />
              <span className="label-md" style={{ color: 'var(--color-text-muted)' }}>Cypher editor</span>
            </div>
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              background: 'var(--color-base)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-strong)', overflow: 'hidden',
            }}>
              <textarea
                value={cypher}
                onChange={(e) => setCypher(e.target.value)}
                spellCheck={false}
                placeholder="MATCH (w:Wallet)-[:SENT]->(tx)-[:TO]->(m:Wallet) RETURN w, tx, m LIMIT 25"
                style={{
                  flex: 1, padding: '1rem', border: 'none',
                  background: 'transparent', color: '#7dd3fc',
                  fontFamily: 'var(--font-mono)', fontSize: '13px',
                  resize: 'none', outline: 'none', lineHeight: '1.65',
                  minHeight: '200px',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.875rem' }}>
              <button className="btn btn-ghost" onClick={() => { setCypher(''); setResults(null); setError(null); setExecutionTime(null); }} style={{ fontSize: '11px' }}>
                <X size={11} /> Clear
              </button>
              <button
                className="btn btn-primary"
                onClick={handleExecute}
                disabled={executing || !cypher.trim()}
                style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', padding: '0.5rem 1.25rem' }}
              >
                {executing ? <Loader2 size={12} className="spin" /> : <Play size={12} fill="currentColor" />}
                {executing ? 'Running…' : 'Run query'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--color-surface-1)' }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-2)', padding: '0 1rem', flexShrink: 0 }}>
            {([
              { id: 'table', icon: <LayoutGrid size={12} />, label: 'Table' },
              { id: 'json',  icon: <Code size={12} />,        label: 'JSON' },
              { id: 'graph', icon: <Network size={12} />,     label: 'Graph' },
            ] as const).map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.625rem 0.75rem',
                background: 'transparent', border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-text-faint)',
                cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 500,
              }}>
                {tab.icon} {tab.label}
              </button>
            ))}
            {executionTime !== null && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', fontSize: '10px', color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)' }}>
                {executionTime}ms
              </div>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div style={{
              padding: '0.625rem 1rem', background: 'var(--color-danger-container)',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: 0,
              fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-danger)',
              flexShrink: 0,
            }}>
              {error}
            </div>
          )}

          {/* Output */}
          <div style={{ flex: 1, overflow: 'auto', padding: '1.25rem' }}>
            {!results ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)', fontSize: '12px', gap: '0.5rem' }}>
                <Terminal size={28} style={{ opacity: 0.3 }} />
                <span>Run a query to see results</span>
              </div>
            ) : (
              <>
                {activeTab === 'json' && (
                  <pre style={{
                    padding: '1rem', background: 'var(--color-base)', color: '#7dd3fc', borderRadius: 'var(--radius-md)',
                    fontFamily: 'var(--font-mono)', fontSize: '12px', overflow: 'auto', margin: 0,
                    border: '1px solid var(--color-border)',
                  }}>
                    {JSON.stringify(results.data, null, 2)}
                  </pre>
                )}

                {activeTab === 'table' && results.columns && results.data && (
                  <div style={{ overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: 'var(--font-sans)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                      <thead>
                        <tr style={{ background: 'var(--color-surface-2)' }}>
                          {results.columns.map((col: string) => (
                            <th key={col} style={{ padding: '0.625rem 0.875rem', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results.data.map((row: any, i: number) => (
                          <tr key={i} className="table-row-hover" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-1)' }}>
                            {results.columns.map((col: string) => (
                              <td key={col} style={{ padding: '0.625rem 0.875rem', color: 'var(--color-text)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                                {typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col])}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {results.data.length === 0 && (
                          <tr>
                            <td colSpan={results.columns.length} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-faint)', fontSize: '12px' }}>
                              No records returned.
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
                      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)', textAlign: 'center', gap: '0.5rem' }}>
                        <Network size={28} style={{ opacity: 0.3 }} />
                        <span style={{ fontSize: '12px' }}>No graph entities in result.</span>
                        <span style={{ fontSize: '11px', opacity: 0.7 }}>Tip: MATCH (w:Wallet)-[r]-{'>'} (tx) RETURN w, r, tx LIMIT 10</span>
                      </div>
                    ) : (
                      <ForceGraph2D
                        ref={fgRef}
                        graphData={graphData}
                        nodeLabel="name"
                        nodeColor="color"
                        linkColor={() => 'rgba(148,163,184,0.4)'}
                        linkWidth={1.5}
                        linkDirectionalArrowLength={4}
                        linkDirectionalArrowRelPos={1}
                        width={graphDims.width}
                        height={graphDims.height}
                        backgroundColor="transparent"
                        d3AlphaDecay={0.05}
                        nodeCanvasObjectMode={() => 'after'}
                        nodeCanvasObject={(node: any, ctx, globalScale) => {
                          const r = node.val;
                          ctx.beginPath();
                          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
                          ctx.fillStyle = node.color;
                          ctx.fill();
                          ctx.lineWidth = 1.5 / globalScale;
                          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
                          ctx.stroke();
                          if (globalScale > 1.2) {
                            const label = node.name.length > 8 ? node.name.substring(0, 6) + '..' : node.name;
                            const fontSize = 9 / globalScale;
                            ctx.font = `${fontSize}px "${import.meta.env.VITE_FONT || 'JetBrains Mono'}", monospace`;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = 'rgba(148,163,184,0.85)';
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
