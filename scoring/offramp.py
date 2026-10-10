"""
scoring/offramp.py
------------------
Stage 5: Off-Ramp Execution (Detection, Directed Dijkstra, Exposure, Severity)
Implements Section 3 (Stage 5) and Section 5.4/5.5 of risk_score.md.
"""

from collections import defaultdict
from datetime import datetime
import math
import heapq
from typing import Dict, List, Set, Any, Tuple, Optional

from normalize import (
    DUST_ETH, MAX_HOPS, LAMBDA_HOP_PENALTY,
    PROBABLE_DEPOSIT_SWEEP_RATIO, PROBABLE_DEPOSIT_SWEEP_WINDOW,
    OFFRAMP_CRITICAL_ETH, OFFRAMP_CRITICAL_HOPS, OFFRAMP_CRITICAL_CONF,
    OFFRAMP_HIGH_ETH, OFFRAMP_HIGH_HOPS, OFFRAMP_HIGH_CONF,
    is_dust, get_label_info, get_label_type, normalize_address,
)
from scoring.patterns import _parse_timestamp


def detect_off_ramps(
    transfers: List[Dict[str, Any]],
    wallets: Set[str],
) -> Dict[str, Dict[str, Any]]:
    """
    Identifies confirmed VASPs and probable deposit addresses sweeping into a VASP.
    Returns {address: {"entity": str, "confidence_label": "confirmed"|"probable", "sweep_target": str|None}}
    Supports both Ethereum and Solana.
    """
    off_ramps: Dict[str, Dict[str, Any]] = {}

    # 1. Confirmed VASPs
    for w in wallets:
        w_norm = normalize_address(w)
        label_info = get_label_info(w_norm)
        if label_info.get("type") == "vasp":
            off_ramps[w_norm] = {
                "entity": label_info.get("name", "VASP"),
                "confidence_label": "confirmed",
                "depositAddress": None,
                "sweep_target": None,
            }

    # 2. Probable deposit addresses: unlabelled, >= 90% non-dust outflow sweeps to a single VASP,
    # >= 2 inbound transfers, and forwarding within 24h
    native_txs = [
        t for t in transfers
        if t.get("assetType", "eth") in ("eth", "sol") and not is_dust(t.get("amount", 0.0))
    ]

    out_per_node: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    in_per_node: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    for t in native_txs:
        src = normalize_address(t["source"])
        tgt = normalize_address(t["target"])
        out_per_node[src].append(t)
        in_per_node[tgt].append(t)

    for w in wallets:
        w_norm = normalize_address(w)
        if w_norm in off_ramps or get_label_type(w_norm) != "none":
            continue


        in_txs = in_per_node.get(w_norm, [])
        out_txs = out_per_node.get(w_norm, [])

        if len(in_txs) < 2 or not out_txs:
            continue

        total_out = sum(float(t.get("amount", 0.0)) for t in out_txs)
        if total_out <= 0:
            continue

        # Group outflows by VASP destination
        vasp_outflows: Dict[str, float] = defaultdict(float)
        for t in out_txs:
            tgt = normalize_address(t["target"])
            if tgt in off_ramps and off_ramps[tgt]["confidence_label"] == "confirmed":
                vasp_outflows[tgt] += float(t.get("amount", 0.0))

        if not vasp_outflows:
            continue

        top_vasp, vasp_amt = max(vasp_outflows.items(), key=lambda item: item[1])
        sweep_ratio = vasp_amt / total_out

        if sweep_ratio >= PROBABLE_DEPOSIT_SWEEP_RATIO:
            # Check sweep timing (within 24h)
            earliest_in = min(_parse_timestamp(t.get("blockTimestamp") or t.get("timestamp")) for t in in_txs)
            earliest_out = min(_parse_timestamp(t.get("blockTimestamp") or t.get("timestamp")) for t in out_txs)
            sweep_delay = abs(earliest_out - earliest_in) if (earliest_in > 0 and earliest_out > 0) else 0

            if sweep_delay <= PROBABLE_DEPOSIT_SWEEP_WINDOW:
                parent_entity = off_ramps[top_vasp]["entity"]
                off_ramps[w_norm] = {
                    "entity": f"{parent_entity} (Deposit)",
                    "confidence_label": "probable",
                    "depositAddress": w_norm,
                    "sweep_target": top_vasp,
                }

    return off_ramps


def search_highest_flow_paths(
    origin_set: Set[str],
    off_ramp_set: Set[str],
    transfers: List[Dict[str, Any]],
    max_hops: int = MAX_HOPS,
    hop_penalty: float = LAMBDA_HOP_PENALTY,
) -> Dict[str, Dict[str, Any]]:
    """
    Builds directed graph of non-dust native transfers and runs Dijkstra
    with edge cost = -ln(share) + lambda, depth-limited to max_hops.
    Returns {off_ramp: {"path": list, "hops": int, "pathFlowShare": float}}
    Supports both Ethereum and Solana.
    """
    native_txs = [
        t for t in transfers
        if t.get("assetType", "eth") in ("eth", "sol") and not is_dust(t.get("amount", 0.0))
    ]

    outflow_per_node: Dict[str, float] = defaultdict(float)
    graph_edges: Dict[str, Dict[str, float]] = defaultdict(lambda: defaultdict(float))

    for t in native_txs:
        u = normalize_address(t["source"])
        v = normalize_address(t["target"])
        amt = float(t.get("amount", 0.0))
        outflow_per_node[u] += amt
        graph_edges[u][v] += amt

    # Precompute edge costs: cost(u -> v) = -ln(amt / out_u) + hop_penalty
    adj_cost: Dict[str, List[Tuple[str, float, float]]] = defaultdict(list)
    for u, targets in graph_edges.items():
        tot_out = outflow_per_node[u]
        for v, amt in targets.items():
            if tot_out > 0 and amt > 0:
                share = max(1e-6, min(1.0, amt / tot_out))
                cost = -math.log(share) + hop_penalty
                adj_cost[u].append((v, cost, share))

    best_paths: Dict[str, Dict[str, Any]] = {}

    for origin in origin_set:
        origin_norm = normalize_address(origin)
        # Priority queue stores: (cumulative_cost, hop_count, current_node, path_nodes, flow_share)
        pq = [(0.0, 0, origin_norm, [origin_norm], 1.0)]
        visited: Dict[str, float] = {}

        while pq:
            cost, hops, curr, path, q_share = heapq.heappop(pq)

            if curr in off_ramp_set and curr != origin_norm:
                if curr not in best_paths or cost < best_paths[curr]["cost"]:
                    best_paths[curr] = {
                        "path": path,
                        "hops": hops,
                        "pathFlowShare": round(q_share, 4),
                        "cost": cost,
                    }

            if hops >= max_hops:
                continue

            if curr in visited and visited[curr] <= cost:
                continue
            visited[curr] = cost

            for nxt, edge_cost, edge_share in adj_cost[curr]:
                if nxt not in path:  # Prevent cycles
                    heapq.heappush(
                        pq,
                        (
                            cost + edge_cost,
                            hops + 1,
                            nxt,
                            path + [nxt],
                            q_share * edge_share,
                        ),
                    )

    return best_paths


def evaluate_off_ramp_leads(
    origin_set: Set[str],
    transfers: List[Dict[str, Any]],
    taint_map: Dict[str, float],
    peel_chains: List[Dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    """
    Full Stage 5 execution pipeline:
    - Detects off-ramps
    - Runs highest-flow Dijkstra path search
    - Calculates exposure, confidence, severity, priority
    - Produces the Section 5.5 off-ramp record structure.
    """
    if peel_chains is None:
        peel_chains = []

    all_wallets = set(taint_map.keys())
    for t in transfers:
        all_wallets.add(normalize_address(t["source"]))
        all_wallets.add(normalize_address(t["target"]))

    off_ramp_meta = detect_off_ramps(transfers, all_wallets)
    off_ramp_addresses = set(off_ramp_meta.keys())

    if not off_ramp_addresses:
        # Check if trace ended in mixer/bridge
        mixer_bridge_nodes = [w for w in all_wallets if get_label_type(w) in {"mixer", "bridge"} and taint_map.get(w, 0) > 0]
        if mixer_bridge_nodes:
            return {
                "offRamps": [],
                "offRampStatus": "trace_break",
                "traceBreakEntities": [get_label_info(m)["name"] for m in mixer_bridge_nodes],
            }
        return {
            "offRamps": [],
            "offRampStatus": "no off-ramp found within trace limits",
        }

    # Path search
    paths_found = search_highest_flow_paths(origin_set, off_ramp_addresses, transfers)

    # Count unscored token transfers into off-ramps (prompt for manual review)
    token_tx_counts: Dict[str, int] = defaultdict(int)
    for t in transfers:
        if t.get("assetType") == "token":
            tgt = normalize_address(t.get("target", ""))
            if tgt in off_ramp_addresses:
                token_tx_counts[tgt] += 1

    # Inbound non-dust native deposits for exposure calculation
    native_txs = [
        t for t in transfers
        if t.get("assetType", "eth") in ("eth", "sol") and not is_dust(t.get("amount", 0.0))
    ]

    deposits_per_offramp: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for t in native_txs:
        tgt = normalize_address(t.get("target", ""))
        if tgt in off_ramp_addresses:
            deposits_per_offramp[tgt].append(t)

    # Cash-out peel lookup
    cash_out_peel_targets = {
        normalize_address(chain["end"]) for chain in peel_chains if chain.get("cash_out_peel")
    }

    records: List[Dict[str, Any]] = []

    for o_addr, meta in off_ramp_meta.items():
        deposits = deposits_per_offramp.get(o_addr, [])
        path_info = paths_found.get(o_addr)

        # Calculate exposure: tainted_eth = sum(taint(u) * amt)
        tainted_eth = sum(
            taint_map.get(normalize_address(d["source"]), 0.0) * float(d.get("amount", 0.0))
            for d in deposits
        )

        # Confidence: max incoming taint
        conf = max(
            [taint_map.get(normalize_address(d["source"]), 0.0) for d in deposits] or [0.0]
        )

        # If reachable via path, check path endpoint taint as fallback
        if conf == 0.0 and path_info and len(path_info["path"]) >= 2:
            pred = path_info["path"][-2]
            conf = taint_map.get(pred, 0.0)

        # Timestamps
        deposit_times = [
            _parse_timestamp(d.get("blockTimestamp") or d.get("timestamp"))
            for d in deposits if _parse_timestamp(d.get("blockTimestamp") or d.get("timestamp")) > 0
        ]
        first_dep = datetime.utcfromtimestamp(min(deposit_times)).isoformat() + "Z" if deposit_times else None
        last_dep = datetime.utcfromtimestamp(max(deposit_times)).isoformat() + "Z" if deposit_times else None

        hops = path_info["hops"] if path_info else 99
        path_nodes = path_info["path"] if path_info else []
        flow_share = path_info["pathFlowShare"] if path_info else 0.0

        is_peel = o_addr in cash_out_peel_targets or any(p in cash_out_peel_targets for p in path_nodes)

        # 5.4 Severity calculation
        if tainted_eth >= OFFRAMP_CRITICAL_ETH and hops <= OFFRAMP_CRITICAL_HOPS and conf >= OFFRAMP_CRITICAL_CONF:
            severity = "CRITICAL"
        elif tainted_eth >= OFFRAMP_HIGH_ETH and hops <= OFFRAMP_HIGH_HOPS and conf >= OFFRAMP_HIGH_CONF:
            severity = "HIGH"
        elif tainted_eth >= DUST_ETH:
            severity = "MEDIUM"
        else:
            severity = "INFO"

        # Cash-out peel escalation by 1 tier
        if is_peel:
            if severity == "MEDIUM":
                severity = "HIGH"
            elif severity == "HIGH":
                severity = "CRITICAL"

        action = (
            f"Prepare a record-preservation / freeze request for the investigating agency "
            f"to send to {meta['entity']}'s compliance contact. "
            f"Include deposit address ({meta.get('depositAddress') or o_addr}), timestamps and evidence path."
        )

        records.append({
            "entity": meta["entity"],
            "tokenTransfersUnscored": token_tx_counts.get(o_addr, 0),
            "address": o_addr,
            "confidence_label": meta["confidence_label"],
            "depositAddress": meta.get("depositAddress"),
            "hops": hops if hops < 99 else len(path_nodes) - 1 if path_nodes else 0,
            "path": path_nodes,
            "pathFlowShare": flow_share,
            "taintedEth": round(tainted_eth, 4),
            "conf": round(conf, 4),
            "firstDeposit": first_dep,
            "lastDeposit": last_dep,
            "cashOutPeel": is_peel,
            "severity": severity,
            "recommendedAction": action,
        })

    # Sort by taintedEth descending, then recency
    records.sort(key=lambda r: (r["taintedEth"], r["lastDeposit"] or ""), reverse=True)

    status = "found" if any(r["hops"] <= MAX_HOPS for r in records) else "no off-ramp found within trace limits"

    return {
        "offRamps": records,
        "offRampStatus": status,
    }
