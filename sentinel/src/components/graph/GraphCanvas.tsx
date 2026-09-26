import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useStore } from '../../store/useStore';
import type { FGNode, FGLink, WalletNode, NodeType } from '../../types/graph';

// Neo4j Government Theme Matrix
const NODE_CONFIG: Record<NodeType | 'pool', { color: string; size: number }> = {
  suspect: { color: '#DC2626', size: 10 },
  intermediate: { color: '#012B39', size: 8 },
  sybil: { color: '#F59E0B', size: 8 },
  vasp: { color: '#16A34A', size: 10 },
  mixer: { color: '#7C3AED', size: 9 },
  pool: { color: '#018BFF', size: 7 },
};

const EDGE_COLORS: Record<string, string> = {
  peel: 'rgba(220,38,38,0.7)',
  offramp: 'rgba(22,163,74,0.7)',
  normal: 'rgba(156,163,175,0.8)',
};

const BackgroundParticles = ({ width, height }: { width: number; height: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // B G R colors moving randomly
    const particles = Array.from({ length: 65 }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      color: ['#3B82F6', '#10B981', '#EF4444'][Math.floor(Math.random() * 3)],
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.5 + 0.2
    }));

    let animationId: number;
    const render = () => {
      ctx.clearRect(0, 0, width, height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.shadowBlur = 5;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;
      });
      animationId = requestAnimationFrame(render);
    };
    render();

    return () => cancelAnimationFrame(animationId);
  }, [width, height]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }} />;
};

function drawNode(ctx: CanvasRenderingContext2D, node: FGNode, globalScale: number, isSelected: boolean) {
  const cfg = NODE_CONFIG[node.type] || NODE_CONFIG.intermediate;

  // Real telemetry logarithmic scale if available, else standard
  const baseR = (node.txCount && node.txCount > 0) ? Math.max(5, Math.min(14, Math.log2(node.txCount + 1) * 2)) : cfg.size;
  const r = baseR / globalScale;
  const x = node.x ?? 0;
  const y = node.y ?? 0;

  // ML Fraud Halo Pulse
  if (node.flagged || node.type === 'suspect') {
    ctx.beginPath();
    const pulseOffset = (Date.now() % 2000) / 2000;
    ctx.arc(x, y, r + (8 * pulseOffset / globalScale), 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(220, 38, 38, ${0.3 * (1 - pulseOffset)})`;
    ctx.fill();
  }

  // Draw Core Circular Node (Neo4j Style)
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = cfg.color;
  ctx.fill();

  // Draw Thick White Stroke (Neo4j authentic standard)
  ctx.lineWidth = isSelected ? 3.5 / globalScale : 2.5 / globalScale;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();

  if (isSelected) {
    // Outer selection ring bounds the white stroke
    ctx.lineWidth = 1 / globalScale;
    ctx.strokeStyle = cfg.color;
    ctx.stroke();
  }

  // Draw Label Outside
  if (globalScale > 0.4 && node.label) {
    const fontSize = Math.max(4, 7 / globalScale);
    ctx.font = `700 ${fontSize}px "Inter", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const shortLabel = node.label.length > 10 ? node.label.substring(0, 10) + "..." : node.label;

    // Label shadow for readability over edges
    ctx.shadowColor = 'rgba(255,255,255,0.8)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#111827';
    ctx.fillText(shortLabel, x, y + r + (5 / globalScale));
    ctx.shadowBlur = 0; // reset
  }
}

export function GraphCanvas() {
  const traceResult = useStore((s) => s.traceResult);
  const loading = useStore((s) => s.traceLoading);
  const traceError = useStore((s) => s.traceError);
  const traceAddress = useStore((s) => s.traceAddress);
  const selectedNode = useStore((s) => s.selectedNode);
  const selectNode = useStore((s) => s.selectNode);
  const graphDirection = useStore((s) => s.graphDirection);
  const graphAssetFilter = useStore((s) => s.graphAssetFilter);

  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });
  const [ticker, setTicker] = useState(0);

  // Force canvas animation frame for the ML halopulses
  useEffect(() => {
    let animationId: number;
    const loop = () => {
      setTicker((t) => t + 1);
      animationId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animationId);
  }, []);

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      if (entries[0]) {
        setDims({ width: entries[0].contentRect.width, height: entries[0].contentRect.height });
      }
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const graphData = useMemo(() => {
    if (!traceResult || !traceResult.nodes || !traceResult.edges) {
      return { nodes: [], links: [] };
    }

    const rawNodes = JSON.parse(JSON.stringify(traceResult.nodes));
    const rawEdges = JSON.parse(JSON.stringify(traceResult.edges));

    let filteredEdges = rawEdges;

    // Filter by Direction
    if (graphDirection === 'OUTBOUND') {
      filteredEdges = filteredEdges.filter((e: any) => e.flowDirection !== 'inbound');
    } else if (graphDirection === 'INBOUND') {
      filteredEdges = filteredEdges.filter((e: any) => e.flowDirection === 'inbound');
    }

    // Filter by Asset
    if (graphAssetFilter === 'ETH') {
      filteredEdges = filteredEdges.filter((e: any) => e.assetType === 'eth');
    } else if (graphAssetFilter === 'TOKEN') {
      filteredEdges = filteredEdges.filter((e: any) => e.assetType === 'token');
    }

    const activeNodes = new Set<string>();
    activeNodes.add(traceResult.rootAddress.toLowerCase()); // always keep root

    filteredEdges.forEach((e: any) => {
      activeNodes.add(e.source.toLowerCase());
      activeNodes.add(e.target.toLowerCase());
    });

    const nodes = rawNodes
      .filter((n: any) => graphDirection === 'ALL' || activeNodes.has(n.id.toLowerCase()))
      .map((n: any) => ({
        ...n,
        id: String(n.id),
        label: n.data?.label || n.label || 'Unknown',
        type: n.type || 'intermediate'
      }));

    const nodeIds = new Set(nodes.map((n: any) => n.id));

    const links = filteredEdges.map((e: any) => ({
      ...e,
      source: String(e.source),
      target: String(e.target)
    })).filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target));

    return { nodes, links };
  }, [traceResult, graphDirection, graphAssetFilter]);

  const handleNodeClick = useCallback((node: any) => {
    selectNode(node as WalletNode);
  }, [selectNode]);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node: FGNode } | null>(null);

  const handleNodeRightClick = useCallback((node: any, event: MouseEvent) => {
    selectNode(node as WalletNode);
    setContextMenu({ x: event.clientX, y: event.clientY, node: node as FGNode });
  }, [selectNode]);

  useEffect(() => {
    const closeContext = () => setContextMenu(null);
    window.addEventListener('click', closeContext);
    return () => window.removeEventListener('click', closeContext);
  }, []);

  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    drawNode(ctx, node as FGNode, globalScale, selectedNode?.id === node.id);
  }, [selectedNode, ticker]); // ticker ensures 60fps pulsing

  const linkCanvasObject = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const start = link.source;
    const end = link.target;
    if (!start || !end || typeof start.x !== 'number' || typeof end.x !== 'number') return;

    const color = EDGE_COLORS[link.type] ?? EDGE_COLORS.normal;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, (link.amount ? Math.log10(link.amount + 1.1) : 1)) / globalScale;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    // Hover value tags
    if (globalScale > 0.8) {
      const mx = (start.x + end.x) / 2;
      const my = (start.y + end.y) / 2;
      const fontSize = Math.max(3.5, 4.5 / globalScale);

      const amountTxt = link.amount ? `${Number(link.amount).toFixed(2)} ETH` : 'Tx';
      ctx.font = `500 ${fontSize}px "Inter", sans-serif`;

      const textWidth = ctx.measureText(amountTxt).width;

      // Draw white pill background behind text for clarity
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.roundRect?.(mx - textWidth / 2 - 2 / globalScale, my - fontSize / 2 - 2 / globalScale, textWidth + 4 / globalScale, fontSize + 4 / globalScale, 2 / globalScale);
      ctx.fill();

      ctx.fillStyle = '#4B5563'; // muted gray text
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(amountTxt, mx, my);
    }
    ctx.restore();
  }, []);

  const handleReCenter = () => graphRef.current?.zoomToFit(400, 40);

  return (
    <div ref={containerRef} className="graph-dot-grid" style={{ position: 'absolute', inset: 0 }}>
      {/* Dynamic Background Particle System */}
      <BackgroundParticles width={dims.width} height={dims.height} />

      {loading && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="headline-md" style={{ color: 'var(--color-tertiary)' }}>TRACING WALLET...</div>
        </div>
      )}

      {/* Error state: backend unreachable or server error */}
      {!loading && traceError && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            maxWidth: '480px', padding: '1.5rem 2rem', borderRadius: '8px',
            background: '#FEF2F2', border: '2px solid #FECACA',
            boxShadow: '0 4px 16px rgba(220,38,38,0.1)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '20px', marginBottom: '0.5rem' }}>⚠</div>
            <div className="headline-sm" style={{ color: '#DC2626', marginBottom: '0.5rem' }}>TRACE FAILED</div>
            <div className="body-md" style={{ color: '#991B1B', lineHeight: 1.6 }}>{traceError}</div>
          </div>
        </div>
      )}

      {/* Empty data state: trace succeeded but 0 nodes returned */}
      {!loading && !traceError && traceResult && graphData.nodes.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            maxWidth: '460px', padding: '2rem', borderRadius: '4px',
            background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.15)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '24px', marginBottom: '1rem', color: 'var(--color-primary)' }}>⊘</div>
            <div style={{ color: 'var(--color-text)', letterSpacing: '2px', fontWeight: 600, fontSize: '13px', marginBottom: '0.75rem' }}>TRACE COMPLETED: NO INDEXED TARGETS</div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '12px', lineHeight: 1.6 }}>
              The forensic engine could not extract any active transactions matching the current flow or asset filters for
              <code style={{ marginLeft: '6px', fontSize: '11px', background: 'var(--color-surface-3)', color: 'var(--color-text)', padding: '0.2rem 0.4rem', border: '1px solid var(--color-border)', borderRadius: '3px' }}>
                {traceAddress.slice(0, 8)}...{traceAddress.slice(-6)}
              </code>.
              <br /><br />
              <b>Troubleshooting:</b> The wallet is either completely inactive, or all paths have been filtered out by your current directional toggles.
            </div>
          </div>
        </div>
      )}

      {/* Initial idle state: no trace attempted yet */}
      {!loading && !traceError && !traceResult && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="body-lg" style={{ color: 'var(--color-text-faint)' }}>ENTER STARTING ADDRESS TO INITIATE FORENSIC GRAPH</div>
        </div>
      )}

      {!loading && graphData.nodes.length > 0 && (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={dims.width}
          height={dims.height}
          backgroundColor="transparent"
          linkDirectionalParticles={(l: any) => l.amount ? 3 : 2}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleColor={() => '#0EA5E9'}
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => 'replace'}
          linkCanvasObject={linkCanvasObject}
          linkCanvasObjectMode={() => 'replace'}
          onNodeClick={handleNodeClick}
          onNodeRightClick={handleNodeRightClick}
          cooldownTime={3000}
          d3VelocityDecay={0.4} // Higher strictness, lower drift
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={0.8}
          linkDirectionalArrowColor={(l: any) => EDGE_COLORS[l.type] ?? EDGE_COLORS.normal}
          linkCurvature={0.25} // Neo4j distinctive curved multi-edges
          onEngineStop={() => {
            if (graphRef.current) {
              const currentZoom = graphRef.current.zoom();
              if (currentZoom < 2.5) {
                // Auto-zoom to 250% scale
                graphRef.current.zoom(2.25, 800);
              }
            }
          }}
        />
      )}

      {/* Radial Context Menu overlay */}
      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x + 10, top: contextMenu.y + 10 }}>
          <div className="label-sm" style={{ padding: '0 0.875rem 0.25rem', color: 'var(--color-text-faint)' }}>{contextMenu.node.label}</div>
          <div className="context-menu-divider" />
          <button className="context-menu-item">⚲ Trace +1 Hop Depth</button>
          <button className="context-menu-item">◈ Run Peeling Check</button>
          <button className="context-menu-item">⬡ Map to KnownVASPs</button>
          <div className="context-menu-divider" />
          <button className="context-menu-item danger">Flag as Sybil Pivot</button>
        </div>
      )}

      <div style={{ position: 'absolute', bottom: '1rem', right: '1rem', zIndex: 15 }}>
        <button className="btn btn-ghost" style={{ background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }} onClick={handleReCenter} disabled={graphData.nodes.length === 0}>
          ◎ RE-CENTER
        </button>
      </div>
    </div>
  );
}