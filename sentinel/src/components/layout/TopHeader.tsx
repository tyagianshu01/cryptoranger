import React, { useState, useEffect } from "react";
import {
  Search, Clock, Menu, ChevronDown, Loader2, AlertCircle, X,
} from "lucide-react";
import { useStore } from "../../store/useStore";

export function TopHeader() {
  const traceResult  = useStore((s) => s.traceResult);
  const traceLoading = useStore((s) => s.traceLoading);
  const traceError   = useStore((s) => s.traceError);
  const runTrace     = useStore((s) => s.runTrace);
  const toggleSidebar = useStore((s) => s.toggleSidebar);

  const [inputAddr, setInputAddr]         = useState("");
  const [inputHops, setInputHops]         = useState(5);
  const [inputLimit, setInputLimit]       = useState(100);
  const [inputEpochDate, setInputEpochDate] = useState("");
  const [showFilters, setShowFilters]     = useState(false);
  const [time, setTime]                   = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleTrace = () => {
    if (inputAddr.trim()) {
      let epoch = 0;
      if (inputEpochDate) epoch = Math.floor(new Date(inputEpochDate).getTime() / 1000);
      const isSol = !/^0x[0-9a-fA-F]{40}$/i.test(inputAddr.trim());
      const limitToUse = isSol && inputLimit === 100 ? 5 : inputLimit;
      runTrace(inputAddr.trim(), inputHops, limitToUse, epoch);
    }
  };

  const riskScore = traceResult?.riskScore ?? 0;
  const riskColor = riskScore >= 80 ? "var(--color-danger)" : riskScore >= 50 ? "var(--color-warn)" : "var(--color-success)";

  return (
    <div style={{ background: "var(--color-surface-1)" }}>

      {/* Row 1: Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 0.875rem",
        borderBottom: "1px solid var(--color-border)",
        height: "36px", overflow: "hidden", minWidth: 0,
        background: "var(--color-surface-2)",
      }}>
        {/* Left: menu toggle */}
        <button
          onClick={toggleSidebar}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '4px', borderRadius: '4px', color: 'var(--color-text-muted)',
          }}
          aria-label="Toggle sidebar"
        >
          <Menu size={15} />
        </button>

        {/* Right: clock + session chip */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <Clock size={10} color="var(--color-text-faint)" />
            <span className="label-sm" style={{ color: "var(--color-text-muted)", fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
              {time.toLocaleTimeString("en-US", { hour12: false })} UTC+5:30
            </span>
          </div>
          {traceResult && (
            <div style={{
              display: "flex", alignItems: "center", gap: "0.375rem",
              padding: "0.125rem 0.5rem",
              background: "var(--color-surface-3)", borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border-strong)",
            }}>
              <span className="status-dot status-dot-active" />
              <span className="label-sm" style={{ color: "var(--color-text-muted)" }}>Trace active</span>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Search bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: "0.5rem",
        padding: "0.5rem 0.875rem",
        borderBottom: "1px solid var(--color-border)",
        overflow: "hidden", minWidth: 0,
      }}>
        {/* Address input */}
        <div style={{
          flex: 1, display: "flex", alignItems: "center", gap: "0.5rem",
          background: "var(--color-surface-2)",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "var(--radius-md)",
          padding: "0.375rem 0.75rem",
          minWidth: 0,
          transition: "border-color 0.15s ease",
        }}
          onFocusCapture={(e) => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-primary)'}
          onBlurCapture={(e) => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border-strong)'}
        >
          <Search size={13} color="var(--color-text-faint)" style={{ flexShrink: 0 }} />
          <input
            id="wallet-address-input"
            type="text"
            value={inputAddr}
            onChange={(e) => {
              const val = e.target.value;
              setInputAddr(val);
              const trimmed = val.trim();
              if (trimmed && !/^0x[0-9a-fA-F]{40}$/i.test(trimmed) && inputLimit === 100) {
                setInputLimit(5);
              } else if (trimmed && /^0x[0-9a-fA-F]{40}$/i.test(trimmed) && inputLimit === 5) {
                setInputLimit(100);
              }
            }}
            onKeyDown={(e) => e.key === "Enter" && handleTrace()}
            placeholder="Enter wallet address (0x... or Solana)"
            style={{
              flex: 1,
              background: "none", border: "none", outline: "none",
              color: "var(--color-text)", fontFamily: "var(--font-mono)",
              fontSize: "12px", minWidth: 0,
            }}
          />
          {inputAddr && (
            <button onClick={() => setInputAddr("")} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--color-text-faint)", padding: 0, lineHeight: 1,
              flexShrink: 0, display: 'flex',
            }}><X size={12} /></button>
          )}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="btn btn-ghost"
          style={{ flexShrink: 0, padding: "0.375rem 0.625rem", fontSize: "11px", gap: '0.25rem' }}
          aria-expanded={showFilters}
        >
          Filters <ChevronDown size={11} style={{ transition: 'transform 0.15s', transform: showFilters ? 'rotate(180deg)' : 'none' }} />
        </button>

        {/* Analyze button */}
        <button
          id="trace-wallet-btn"
          className="btn btn-primary"
          onClick={handleTrace}
          disabled={traceLoading || !inputAddr.trim()}
          style={{ flexShrink: 0, padding: "0.4rem 1rem", fontSize: "12px" }}
        >
          {traceLoading ? (
            <><Loader2 size={12} className="spin" /> Analyzing…</>
          ) : "Analyze"}
        </button>
      </div>

      {/* Row 2.5: Collapsible filter bar */}
      {showFilters && (
        <div style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.4rem 0.875rem",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface-2)",
          flexWrap: "wrap",
        }}>
          {/* Flow selector */}
          <FilterChip label="Flow">
            <select id="flow-dir-select" value={useStore((s) => s.graphDirection)}
              onChange={(e) => useStore.getState().setGraphDirection(e.target.value as any)}
              style={selectStyle}>
              <option value="ALL">All</option>
              <option value="OUTBOUND">Outbound</option>
              <option value="INBOUND">Inbound</option>
            </select>
          </FilterChip>

          {/* Asset selector */}
          <FilterChip label="Asset">
            <select id="asset-type-select" value={useStore((s) => s.graphAssetFilter)}
              onChange={(e) => useStore.getState().setGraphAssetFilter(e.target.value as any)}
              style={selectStyle}>
              <option value="ALL">All (Native & Token)</option>
              <option value="ETH">Native (ETH/SOL)</option>
              <option value="TOKEN">Tokens only</option>
            </select>
          </FilterChip>

          {/* Hops selector */}
          <FilterChip label="Depth">
            <select id="hop-count-select" value={inputHops}
              onChange={(e) => setInputHops(Number(e.target.value))}
              style={selectStyle}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} hop{n > 1 ? 's' : ''}</option>)}
            </select>
          </FilterChip>

          {/* Spread selector */}
          <FilterChip label="Limit">
            <select id="limit-count-select" value={inputLimit}
              onChange={(e) => setInputLimit(Number(e.target.value))}
              style={selectStyle}>
              <option value={5}>5 (quick / Solana)</option>
              <option value={100}>100 (fast)</option>
              <option value={500}>500 (deep)</option>
              <option value={2000}>2000</option>
              <option value={10000}>10000</option>
            </select>
          </FilterChip>

          {/* Time filter */}
          <FilterChip label="From">
            <input
              type="datetime-local"
              value={inputEpochDate}
              onChange={(e) => setInputEpochDate(e.target.value)}
              style={{ ...selectStyle, cursor: 'pointer' }}
            />
          </FilterChip>
        </div>
      )}

      {/* Row 3: Trace stats / error strip */}
      <div style={{
        display: "flex", alignItems: "center", gap: "1rem",
        padding: "0.3rem 0.875rem",
        background: "var(--color-surface-2)",
        minHeight: "28px", overflow: "hidden", minWidth: 0,
        borderBottom: "1px solid var(--color-border)",
      }}>
        {traceError ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--color-danger)', flex: 1, minWidth: 0 }}>
            <AlertCircle size={11} style={{ flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {traceError}
            </span>
          </div>
        ) : traceResult ? (
          <>
            <span className="label-sm" style={{ color: "var(--color-text-faint)", flexShrink: 0 }}>Wallet:</span>
            <span className="code-terminal" style={{ color: "var(--color-primary)", fontSize: '11px', flexShrink: 0 }}>
              {traceResult.rootAddress.slice(0, 10)}…{traceResult.rootAddress.slice(-6)}
            </span>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "1.25rem", flexShrink: 0 }}>
              <StatChip label="Nodes"   value={traceResult.nodes.length.toLocaleString()} />
              <StatChip label="Edges"   value={traceResult.edges.length.toLocaleString()} />
              <StatChip label="Risk"    value={`${riskScore}/100`} color={riskColor} />
            </div>
          </>
        ) : (
          <span className="code-terminal" style={{ color: "var(--color-text-faint)", fontSize: '11px' }}>
            {traceLoading ? "Fetching transactions from blockchain and Neo4j…" : "Enter a wallet address above to begin analysis"}
          </span>
        )}
      </div>
    </div>
  );
}

function FilterChip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.375rem",
      background: "var(--color-surface-1)",
      border: "1px solid var(--color-border-strong)",
      borderRadius: "var(--radius-sm)",
      padding: "0.275rem 0.625rem",
      flexShrink: 0,
    }}>
      <span className="label-sm" style={{ color: "var(--color-text-faint)" }}>{label}</span>
      {children}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: "none", border: "none", outline: "none",
  color: "var(--color-text)", fontWeight: 500,
  fontFamily: "var(--font-sans)", fontSize: "11px", cursor: "pointer",
};

function StatChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
      <span className="label-sm" style={{ color: "var(--color-text-faint)" }}>{label}</span>
      <span className="code-terminal" style={{ color: color ?? "var(--color-text)", fontWeight: 700, fontSize: "11px" }}>{value}</span>
    </div>
  );
}
