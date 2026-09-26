import React from 'react';
import { InvestigationBanner } from '../components/summary/InvestigationBanner';
import { BottomSummaryStrip } from '../components/summary/BottomSummaryStrip';

import { GraphCanvas } from '../components/graph/GraphCanvas';

import { GraphControls } from '../components/graph/GraphControls';
import { InspectorDossier } from '../components/panels/InspectorDossier';
import { useStore } from '../store/useStore';

export function GraphExplorer() {
  const traceResult = useStore((s) => s.traceResult);
  const result = traceResult;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      {/* Investigation banner */}
      <div style={{ flexShrink: 0 }}>
        {result && <InvestigationBanner />}
      </div>

      {/* Main workspace grid */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 280px',
        minHeight: '480px', // Resized down an additional 20% 
      }}>

        {/* ── Left/Center: Graph canvas ─────────────────────────────────── */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
          minHeight: 0,
          borderRight: '1px solid var(--color-border)',
        }}>

          {/* Controls bar */}
          <div style={{ flexShrink: 0, overflow: 'hidden' }}>
            <GraphControls />
          </div>

          {/* Graph Canvas — Our fixed ForceGraph goes here! */}
          <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', position: 'relative' }}>
            <GraphCanvas />
          </div>

          {/* Bottom strip */}
          <div style={{ flexShrink: 0, overflow: 'hidden' }}>
            <BottomSummaryStrip />
          </div>
        </div>

        {/* ── Right rail: Inspector dossier ──────── */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0,
        }}>
          <InspectorDossier />
        </div>

      </div>
    </div>
  );
}