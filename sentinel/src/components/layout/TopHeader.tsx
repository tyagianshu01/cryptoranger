import React, { useState, useEffect } from "react";
import {
  Search, Download, User, Clock,
  Wifi, Database, Cpu, AlertTriangle, Globe
} from "lucide-react";
import { useStore } from "../../store/useStore";

export function TopHeader() {
  const traceResult = useStore((s) => s.traceResult);
  const traceLoading = useStore((s) => s.traceLoading);
  const runTrace = useStore((s) => s.runTrace);
  const activeCase = useStore((s) => s.activeCase);

  const [inputAddr, setInputAddr] = useState("");
  const [inputHops, setInputHops] = useState(5);
  const [inputLimit, setInputLimit] = useState(100);
  const [inputEpochDate, setInputEpochDate] = useState("");

  const [time, setTime] = useState(() => new Date());
  const [lang, setLang] = useState<'en' | 'hi'>('en');

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleTrace = () => {
    if (inputAddr.trim()) {
      let epoch = 0;
      if (inputEpochDate) {
        epoch = Math.floor(new Date(inputEpochDate).getTime() / 1000);
      }
      runTrace(inputAddr.trim(), inputHops, inputLimit, epoch);
    }
  };

  const riskScore = traceResult?.riskScore ?? 0;
  const riskColor =
    riskScore >= 80 ? "var(--color-secondary-dim)" :
      riskScore >= 50 ? "var(--color-accent)" :
        "var(--color-india-green)";

  return (
    <div style={{ background: "var(--color-surface-1)" }}>

      {/* Row 1: Status bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0.25rem 1rem",
        borderBottom: "1px solid var(--color-border)",
        overflow: "hidden", minWidth: 0,
        background: "var(--color-surface-2)",
      }}>
        {/* Left: connection pills removed as requested */}
        <div style={{ display: "flex", gap: "0.5rem", overflow: "hidden", minWidth: 0 }}>
        </div>

        {/* Right: Govt Branding + Clock + case */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexShrink: 0 }}>

          {/* External Govt Links / Language */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", borderRight: "1px solid var(--color-surface-4)", paddingRight: "1rem" }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }} onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}>
              <Globe size={11} color="var(--color-primary)" />
              <span className="label-sm" style={{ color: lang === 'en' ? 'var(--color-primary)' : 'var(--color-text-faint)' }}>EN</span>
              <span className="label-sm" style={{ color: 'var(--color-text-faint)' }}>|</span>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: '11px', fontWeight: lang === 'hi' ? 700 : 500, color: lang === 'hi' ? 'var(--color-primary)' : 'var(--color-text-faint)', marginTop: '1px' }}>हिन्दी</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <Clock size={10} color="var(--color-text-faint)" />
            <span className="label-sm" style={{ color: "var(--color-text-muted)" }}>
              {time.toLocaleTimeString("en-US", { hour12: false })} IST
            </span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            padding: "0.15rem 0.625rem",
            background: "var(--color-surface-1)", borderRadius: "2px",
            border: "1px solid var(--color-border)",
          }}>
            <span className="label-sm" style={{ color: "var(--color-text-faint)" }}>CASE</span>
            <span className="code-terminal" style={{ color: "var(--color-primary)" }}>{activeCase.id}</span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: "0.25rem",
            padding: "0.15rem 0.625rem",
            background: "var(--color-surface-1)", borderRadius: "999px",
            border: "1px solid var(--color-border)",
          }}>
            <User size={10} color="var(--color-text-faint)" />
            <span className="label-sm" style={{ color: "var(--color-text)" }}>DIRECTORATE 04</span>
          </div>
        </div>
      </div>

      {/* Row 2: Wallet trace command bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: "0.5rem",
        padding: "0.625rem 1rem",
        borderBottom: "1px solid var(--color-border)",
        overflow: "hidden", minWidth: 0,
      }}>
        {/* Address input */}
        <div style={{
          flex: 1, display: "flex", alignItems: "center", gap: "0.5rem",
          background: "var(--color-surface-1)",
          border: "2px solid var(--color-border)",
          borderRadius: "0.375rem",
          padding: "0.4rem 0.75rem",
          minWidth: 0,
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)',
        }}>
          <Search size={14} color="var(--color-text-faint)" style={{ flexShrink: 0 }} />
          <input
            id="wallet-address-input"
            type="text"
            value={inputAddr}
            onChange={(e) => setInputAddr(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTrace()}
            placeholder="Enter digital asset address for forensic trace (0x...)"
            style={{
              flex: 1,
              background: "none", border: "none", outline: "none",
              color: "var(--color-text)", fontFamily: "var(--font-mono)",
              fontSize: "13px", minWidth: 0,
            }}
          />
          {inputAddr && (
            <button onClick={() => setInputAddr("")} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--color-text-faint)", padding: 0, lineHeight: 1,
              fontSize: "12px", flexShrink: 0,
            }}>✕</button>
          )}
        </div>
      </div>

      {/* Row 2.5: Deep Filter Settings */}
      <div style={{
        display: "flex", alignItems: "center", gap: "0.5rem",
        padding: "0.5rem 1rem",
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-surface-2)",
        overflow: "hidden", minWidth: 0,
        flexWrap: "wrap"
      }}>

        {/* Flow selector */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.375rem",
          background: "var(--color-surface-1)",
          border: "1px solid var(--color-border)",
          borderRadius: "0.375rem",
          padding: "0.45rem 0.75rem",
          flexShrink: 0,
        }}>
          <span className="label-sm" style={{ color: "var(--color-text-faint)" }}>FLOW</span>
          <select id="flow-dir-select" value={useStore((s) => s.graphDirection)}
            onChange={(e) => useStore.getState().setGraphDirection(e.target.value as any)}
            style={{
              background: "none", border: "none", outline: "none",
              color: "var(--color-primary)", fontWeight: 700, fontFamily: "var(--font-sans)", fontSize: "12px", cursor: "pointer"
            }}>
            <option value="OUTBOUND">OUTBOUND ONLY</option>
            <option value="INBOUND">INBOUND ONLY</option>
            <option value="ALL">ALL CONNECTIONS</option>
          </select>
        </div>

        {/* Asset selector */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.375rem",
          background: "var(--color-surface-1)",
          border: "1px solid var(--color-border)",
          borderRadius: "0.375rem",
          padding: "0.45rem 0.75rem",
          flexShrink: 0,
        }}>
          <span className="label-sm" style={{ color: "var(--color-text-faint)" }}>ASSET</span>
          <select id="asset-type-select" value={useStore((s) => s.graphAssetFilter)}
            onChange={(e) => useStore.getState().setGraphAssetFilter(e.target.value as any)}
            style={{
              background: "none", border: "none", outline: "none",
              color: "var(--color-primary)", fontWeight: 700, fontFamily: "var(--font-sans)", fontSize: "12px", cursor: "pointer"
            }}>
            <option value="ALL">ALL (ETH & ERC20)</option>
            <option value="ETH">NATIVE ETH ONLY</option>
            <option value="TOKEN">ERC20 TOKENS ONLY</option>
          </select>
        </div>

        {/* Hops selector */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.375rem",
          background: "var(--color-surface-1)",
          border: "1px solid var(--color-border)",
          borderRadius: "0.375rem",
          padding: "0.45rem 0.75rem",
          flexShrink: 0,
        }}>
          <span className="label-sm" style={{ color: "var(--color-text-faint)" }}>DEPTH</span>
          <select id="hop-count-select" value={inputHops}
            onChange={(e) => setInputHops(Number(e.target.value))}
            style={{
              background: "none", border: "none", outline: "none",
              color: "var(--color-primary)", fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: "14px", cursor: "pointer"
            }}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {/* Spread selector */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.375rem",
          background: "var(--color-surface-1)",
          border: "1px solid var(--color-border)",
          borderRadius: "0.375rem",
          padding: "0.45rem 0.75rem",
          flexShrink: 0,
        }}>
          <span className="label-sm" style={{ color: "var(--color-text-faint)" }}>SPREAD</span>
          <select id="limit-count-select" value={inputLimit}
            onChange={(e) => setInputLimit(Number(e.target.value))}
            style={{
              background: "none", border: "none", outline: "none",
              color: "var(--color-primary)", fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: "12px", cursor: "pointer"
            }}>
            <option value={100}>100 (FAST)</option>
            <option value={500}>500 (DEEP)</option>
            <option value={2000}>2000 (MASSIVE)</option>
            <option value={10000}>10000 (MAX)</option>
          </select>
        </div>

        {/* Time Slice selector */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.375rem",
          background: "var(--color-surface-1)",
          border: "1px solid var(--color-border)",
          borderRadius: "0.375rem",
          padding: "0.35rem 0.75rem",
          flexShrink: 0,
        }}>
          <span className="label-sm" style={{ color: "var(--color-text-faint)" }}>START TIME</span>
          <input
            type="datetime-local"
            value={inputEpochDate}
            onChange={(e) => setInputEpochDate(e.target.value)}
            style={{
              background: "none", border: "none", outline: "none",
              color: "var(--color-primary)", fontWeight: 600, fontFamily: "var(--font-sans)", fontSize: "11px", cursor: "pointer"
            }}
          />
        </div>

        {/* Trace button */}
        <button id="trace-wallet-btn" className="btn btn-primary" onClick={handleTrace}
          disabled={traceLoading || !inputAddr.trim()}
          style={{ flexShrink: 0, padding: "0.5rem 1.5rem", fontSize: "12px", background: 'var(--color-accent)', borderColor: 'var(--color-accent)' }}>
          {traceLoading ? "TRACING..." : "INITIATE TRACE"}
        </button>
      </div>

      {/* Row 3: Trace stats */}
      <div style={{
        display: "flex", alignItems: "center", gap: "0.75rem",
        padding: "0.375rem 1rem",
        background: "var(--color-surface-2)",
        minHeight: "32px", overflow: "hidden", minWidth: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
          <span className="label-sm" style={{ color: "var(--color-text-faint)" }}>TARGET NODE:</span>
          {traceResult ? (
            <span className="code-terminal" style={{ color: "var(--color-primary)" }}>
              {traceResult.rootAddress.slice(0, 10)}...{traceResult.rootAddress.slice(-5)}
            </span>
          ) : (
            <span className="code-terminal" style={{ color: "var(--color-text-faint)" }}>—</span>
          )}
        </div>

        {traceResult ? (
          <>

            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "1.25rem", flexShrink: 0 }}>
              <StatChip label="STRUCTURAL DEPTH" value={`${traceResult.hops} HOPS`} />
              <StatChip label="EXTRACTED NODES" value={`${traceResult.nodes.length.toLocaleString()}`} />
              <StatChip label="ROUTING EDGES" value={`${traceResult.edges.length.toLocaleString()}`} />
            </div>
          </>
        ) : (
          <span className="code-terminal" style={{ color: "var(--color-text-faint)" }}>
            {traceLoading ? "ANALYSIS IN PROGRESS..." : "AWAITING WALLET INPUT FOR HEURISTIC & ML TRACING"}
          </span>
        )}
      </div>

    </div>
  );
}

function StatusPill({ icon, label, value, ok }: { icon: React.ReactNode; label: string; value: string; ok?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.375rem",
      padding: "0.15rem 0.5rem",
      background: "var(--color-surface-1)",
      border: "1px solid var(--color-border)", borderRadius: "4px",
      flexShrink: 0,
    }}>
      <span style={{ color: ok ? "var(--color-india-green)" : "var(--color-secondary)" }}>{icon}</span>
      <span className="label-sm" style={{ color: "var(--color-text-faint)" }}>{label}</span>
      <span className={`status-dot ${ok ? "status-dot-active" : "status-dot-error"}`} style={{
        background: ok ? 'var(--color-india-green)' : 'var(--color-secondary)',
        animation: ok ? 'pulse-green 2s infinite' : 'pulse-red 2s infinite'
      }} />
      <span className="label-sm" style={{ color: ok ? "var(--color-india-green)" : "var(--color-secondary-dim)" }}>{value}</span>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <span className="label-sm" style={{ color: "var(--color-text-faint)" }}>{label}</span>
      <span className="code-terminal" style={{ color: "var(--color-primary)", fontWeight: 700, fontSize: "12px" }}>{value}</span>
    </div>
  );
}
