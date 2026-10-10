import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useStore } from '../../store/useStore';
import type { FGNode, FGLink, WalletNode, NodeType } from '../../types/graph';
import { Loader2, AlertTriangle, Network } from 'lucide-react';

// Node color palette — Dune analytics tokens
const NODE_CONFIG: Record<NodeType | 'pool', { color: string; size: number }> = {
  suspect:      { color: 'rgb(255, 54, 33)', size: 10 },
  intermediate: { color: 'rgb(96, 96, 95)', size: 8 },
  sybil:        { color: '#d97706', size: 8 },
  vasp:         { color: 'rgb(0, 130, 87)', size: 10 },
  mixer:        { color: '#7c3aed', size: 9 },
  pool:         { color: 'rgb(11, 165, 236)', size: 7 },
};

const EDGE_COLORS: Record<string, string> = {
  peel:    'rgba(255, 54, 33, 0.75)',
  offramp: 'rgba(0, 130, 87, 0.75)',
  normal:  'rgba(96, 96, 95, 0.35)',
};

function drawNode(ctx: CanvasRenderingContext2D, node: FGNode, globalScale: number, isSelected: boolean) {
  const cfg = NODE_CONFIG[node.type] || NODE_CONFIG.intermediate;

  // Logarithmic sizing from real tx count
  const baseR = (node.txCount && node.txCount > 0)
    ? Math.max(5, Math.min(14, Math.log2(node.txCount + 1) * 2))
    : cfg.size;
  const r = baseR / globalScale;
  const x = node.x ?? 0;
  const y = node.y ?? 0;

  // Pulsing risk halo for flagged/suspect nodes
  if (node.flagged || node.type === 'suspect') {
    ctx.beginPath();
    const pulseOffset = (Date.now() % 2200) / 2200;
    ctx.arc(x, y, r + (7 * pulseOffset / globalScale), 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(239, 68, 68, ${0.25 * (1 - pulseOffset)})`;
    ctx.fill();
  }

  // Core circle
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = cfg.color;
  ctx.fill();

  // Subtle ring stroke
  ctx.lineWidth = isSelected ? 3 / globalScale : 1.5 / globalScale;
  ctx.strokeStyle = isSelected ? 'rgb(15, 15, 14)' : 'rgba(15, 15, 14, 0.15)';
  ctx.stroke();

  if (isSelected) {
    ctx.beginPath();
    ctx.arc(x, y, r + 2 / globalScale, 0, 2 * Math.PI);
    ctx.lineWidth = 1 / globalScale;
    ctx.strokeStyle = cfg.color;
    ctx.stroke();
  }

  // Label
  if (globalScale > 0.4 && node.label) {
    const fontSize = Math.max(4, 7 / globalScale);
    ctx.font = `600 ${fontSize}px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const shortLabel = node.label.length > 10 ? node.label.substring(0, 10) + '…' : node.label;

    // Clean background pill for readability on canvas
    const textWidth = ctx.measureText(shortLabel).width;
    const labelY = y + r + (5 / globalScale);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x - textWidth / 2 - 2 / globalScale, labelY - fontSize / 2 - 1 / globalScale, textWidth + 4 / globalScale, fontSize + 2 / globalScale, 2 / globalScale);
      ctx.fill();
    }

    ctx.fillStyle = 'rgb(15, 15, 14)';
    ctx.fillText(shortLabel, x, labelY);
  }
}

export function GraphCanvas() {
  const traceResult    = useStore((s) => s.traceResult);
  const loading        = useStore((s) => s.traceLoading);
  const traceError     = useStore((s) => s.traceError);
  const traceAddress   = useStore((s) => s.traceAddress);
  const selectedNode   = useStore((s) => s.selectedNode);
  const selectNode     = useStore((s) => s.selectNode);
  const graphDirection = useStore((s) => s.graphDirection);
  const graphAssetFilter = useStore((s) => s.graphAssetFilter);

  const graphRef     = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims]     = useState({ width: 800, height: 600 });
  const [ticker, setTicker] = useState(0);

  // Continuous render for risk-halo animations
  useEffect(() => {
    let animationId: number;
    const loop = () => { setTicker((t) => t + 1); animationId = requestAnimationFrame(loop); };
    loop();
    return () => cancelAnimationFrame(animationId);
  }, []);

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      if (entries[0]) setDims({ width: entries[0].contentRect.width, height: entries[0].contentRect.height });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const graphData = useMemo(() => {
    if (!traceResult?.nodes || !traceResult?.edges) return { nodes: [], links: [] };

    const rawNodes = JSON.parse(JSON.stringify(traceResult.nodes));
    const rawEdges = JSON.parse(JSON.stringify(traceResult.edges));

    let filteredEdges = rawEdges;
    if (graphDirection === 'OUTBOUND') filteredEdges = filteredEdges.filter((e: any) => e.flowDirection !== 'inbound');
    else if (graphDirection === 'INBOUND') filteredEdges = filteredEdges.filter((e: any) => e.flowDirection === 'inbound');

    if (graphAssetFilter === 'ETH') filteredEdges = filteredEdges.filter((e: any) => e.assetType === 'eth' || e.assetType === 'sol');
    else if (graphAssetFilter === 'TOKEN') filteredEdges = filteredEdges.filter((e: any) => e.assetType === 'token');

    const isSol = traceResult.chain === 'SOL' || !/^0x/i.test(traceResult.rootAddress);
    const norm = (s: string) => isSol ? String(s) : String(s).toLowerCase();
    const activeNodes = new Set<string>();
    activeNodes.add(norm(traceResult.rootAddress));
    filteredEdges.forEach((e: any) => { activeNodes.add(norm(e.source)); activeNodes.add(norm(e.target)); });

    const nodes = rawNodes
      .filter((n: any) => graphDirection === 'ALL' || activeNodes.has(norm(n.id)))
      .map((n: any) => ({ ...n, id: String(n.id), label: n.data?.label || n.label || 'Unknown', type: n.type || 'intermediate' }));

    const nodeIds = new Set(nodes.map((n: any) => n.id));
    const links = filteredEdges
      .map((e: any) => ({ ...e, source: String(e.source), target: String(e.target) }))
      .filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target));

    return { nodes, links };
  }, [traceResult, graphDirection, graphAssetFilter]);


  const handleNodeClick = useCallback((node: any) => selectNode(node as WalletNode), [selectNode]);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FGNode } | null>(null);

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
  }, [selectedNode, ticker]);

  const linkCanvasObject = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const start = link.source;
    const end = link.target;
    if (!start || !end || typeof start.x !== 'number' || typeof end.x !== 'number') return;

    const color = EDGE_COLORS[link.type] ?? EDGE_COLORS.normal;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.8, (link.amount ? Math.log10(link.amount + 1.1) : 0.8)) / globalScale;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    // Amount label on hover
    if (globalScale > 0.8) {
      const mx = (start.x + end.x) / 2;
      const my = (start.y + end.y) / 2;
      const fontSize = Math.max(3.5, 4.5 / globalScale);
      const sym = link.symbol || (traceResult?.chain === 'SOL' ? 'SOL' : 'ETH');
      const amountTxt = link.amount ? `${Number(link.amount).toFixed(2)} ${sym}` : 'Tx';
      ctx.font = `500 ${fontSize}px "Inter", system-ui, sans-serif`;
      const textWidth = ctx.measureText(amountTxt).width;

      // Dark pill background
      ctx.fillStyle = 'rgba(14,17,23,0.85)';
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(mx - textWidth / 2 - 2 / globalScale, my - fontSize / 2 - 2 / globalScale, textWidth + 4 / globalScale, fontSize + 4 / globalScale, 2 / globalScale);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(148,163,184,0.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(amountTxt, mx, my);
    }
    ctx.restore();
  }, []);

  const handleReCenter = () => graphRef.current?.zoomToFit(400, 40);

  return (
    <div ref={containerRef} className="graph-dot-grid" style={{ position: 'absolute', inset: 0, background: 'var(--color-base)' }}>

      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          background: 'rgba(14,17,23,0.85)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
        }}>
          <Loader2 size={24} className="spin" color="var(--color-primary)" />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--color-text-muted)' }}>Tracing wallet…</div>
        </div>
      )}

      {/* Error state */}
      {!loading && traceError && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            maxWidth: '440px', padding: '1.5rem', borderRadius: 'var(--radius-lg)',
            background: 'var(--color-danger-container)', border: '1px solid rgba(239,68,68,0.3)',
            textAlign: 'center',
          }}>
            <AlertTriangle size={20} color="var(--color-danger)" style={{ marginBottom: '0.5rem' }} />
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-danger)', marginBottom: '0.5rem' }}>Trace failed</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>{traceError}</div>
          </div>
        </div>
      )}

      {/* Empty result state */}
      {!loading && !traceError && traceResult && graphData.nodes.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            maxWidth: '420px', padding: '2rem', borderRadius: 'var(--radius-lg)',
            background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
            textAlign: 'center',
          }}>
            <Network size={24} color="var(--color-text-faint)" style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.5rem' }}>No transactions found</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
              No indexed transactions match the current filters for
              <code style={{ marginLeft: '4px', fontSize: '11px', background: 'var(--color-surface-3)', color: 'var(--color-text)', padding: '0.15rem 0.4rem', border: '1px solid var(--color-border)', borderRadius: '3px' }}>
                {traceAddress.slice(0, 8)}…{traceAddress.slice(-6)}
              </code>.
              <br /><br />
              The wallet may be inactive, or all paths are filtered by the current direction/asset settings.
            </div>
          </div>
        </div>
      )}

      {/* Idle state */}
      {!loading && !traceError && !traceResult && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <Network size={32} color="var(--color-text-faint)" style={{ opacity: 0.3 }} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-text-faint)' }}>
            Enter a wallet address to generate the transaction graph
          </div>
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
          linkDirectionalParticleWidth={1.5}
          linkDirectionalParticleColor={() => 'rgb(0, 130, 87)'}
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => 'replace'}
          linkCanvasObject={linkCanvasObject}
          linkCanvasObjectMode={() => 'replace'}
          onNodeClick={handleNodeClick}
          onNodeRightClick={handleNodeRightClick}
          cooldownTime={3000}
          d3VelocityDecay={0.4}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={0.8}
          linkDirectionalArrowColor={(l: any) => EDGE_COLORS[l.type] ?? EDGE_COLORS.normal}
          linkCurvature={0.25}
          onEngineStop={() => {
            if (graphRef.current) {
              const currentZoom = graphRef.current.zoom();
              if (currentZoom < 2.5) graphRef.current.zoom(2.25, 800);
            }
          }}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x + 10, top: contextMenu.y + 10 }}>
          <div className="label-sm" style={{ padding: '0.375rem 0.875rem', color: 'var(--color-text-faint)' }}>{contextMenu.node.label}</div>
          <div className="context-menu-divider" />
          <button className="context-menu-item" onClick={() => {
            const isSol = !contextMenu.node.id.startsWith('0x');
            useStore.getState().runTrace(contextMenu.node.id, 1, isSol ? 5 : 100);
          }}>Trace +1 hop</button>
          <button className="context-menu-item">Check for peel chain</button>
          <button className="context-menu-item">Lookup known exchanges</button>
          <div className="context-menu-divider" />
          <button className="context-menu-item danger">Flag as suspicious</button>
        </div>
      )}

      {/* Re-center button */}
      <div style={{ position: 'absolute', bottom: '0.75rem', right: '0.75rem', zIndex: 15 }}>
        <button
          className="btn btn-ghost"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-strong)' }}
          onClick={handleReCenter}
          disabled={graphData.nodes.length === 0}
        >
          ◎ Re-center
        </button>
      </div>
    </div>
  );
}