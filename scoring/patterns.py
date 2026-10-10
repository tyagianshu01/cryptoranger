"""
scoring/patterns.py
-------------------
Stage 3: Behavioural Pattern Evidence (Peel Chains & Receive->Forward Latency)
Implements Section 3 (Stage 3) of risk_score.md.
"""

from collections import defaultdict
from datetime import datetime
import numpy as np
from typing import Dict, List, Set, Any, Tuple
from normalize import (
    W_PEEL, W_FAST,
    PEEL_MIN_HOPS, PEEL_MAIN_MIN, PEEL_MAIN_MAX, PEEL_MIN_RECEIVERS, PEEL_WINDOW_SECONDS,
    FWD_WINDOW_SECONDS, FWD_MIN_FLOWS, FWD_MATCH_RATIO, FAST_FWD_SECONDS, VERY_FAST_FWD_SECONDS,
    is_dust, get_label_type, normalize_address,
)


def _parse_timestamp(ts: Any) -> float:
    """Parses timestamp to epoch seconds."""
    if isinstance(ts, (int, float)):
        return float(ts)
    if isinstance(ts, str):
        try:
            # Handle ISO string e.g. "2026-10-02T09:14:00Z"
            clean_ts = ts.replace("Z", "+00:00")
            dt = datetime.fromisoformat(clean_ts)
            return dt.timestamp()
        except Exception:
            pass
    return 0.0


def detect_peel_chains(
    transfers: List[Dict[str, Any]],
    off_ramp_set: Set[str] | None = None,
) -> Tuple[Set[str], List[Dict[str, Any]]]:
    """
    Detects chain-level peel chains (k >= 3 hops) satisfying the 70%-99.5% main-outflow band,
    at least 2 distinct receivers per hop, and within 72h window.
    Supports both Ethereum and Solana native transfers.

    Returns:
        (peel_wallets, qualifying_chains)
    """
    if off_ramp_set is None:
        off_ramp_set = set()
    off_ramp_set = {normalize_address(o) for o in off_ramp_set}

    # Only non-dust native transfers (ETH or SOL)
    native_txs = [
        t for t in transfers
        if t.get("assetType", "eth") in ("eth", "sol") and not is_dust(t.get("amount", 0.0))
    ]

    # Map out-edges by sender
    out_by_node: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for t in native_txs:
        out_by_node[normalize_address(t["source"])].append(t)

    # For each node, check if it qualifies as a peel hop:
    # 1. Total outflow out_i
    # 2. At least 2 distinct receivers
    # 3. Exactly one main recipient getting between 70% and 99.5% of total outflow
    peel_hop_info: Dict[str, Dict[str, Any]] = {}

    for node, tx_list in out_by_node.items():
        if get_label_type(node) != "none":
            continue

        distinct_receivers = {normalize_address(t["target"]) for t in tx_list}
        if len(distinct_receivers) < PEEL_MIN_RECEIVERS:
            continue

        total_out = sum(float(t.get("amount", 0.0)) for t in tx_list)
        if total_out <= 0:
            continue

        # Group by target to find main outgoing branch
        out_per_target: Dict[str, float] = defaultdict(float)
        earliest_time_per_target: Dict[str, float] = {}

        for t in tx_list:
            tgt = normalize_address(t["target"])
            amt = float(t.get("amount", 0.0))
            out_per_target[tgt] += amt
            ts = _parse_timestamp(t.get("blockTimestamp") or t.get("timestamp"))
            if tgt not in earliest_time_per_target or (ts > 0 and ts < earliest_time_per_target[tgt]):
                earliest_time_per_target[tgt] = ts

        # Find largest recipient
        main_tgt, main_amt = max(out_per_target.items(), key=lambda item: item[1])
        main_ratio = main_amt / total_out

        if PEEL_MAIN_MIN <= main_ratio <= PEEL_MAIN_MAX:
            peel_hop_info[node] = {
                "main_target": main_tgt,
                "main_amount": main_amt,
                "total_out": total_out,
                "ratio": main_ratio,
                "timestamp": earliest_time_per_target.get(main_tgt, 0.0),
            }

    # Now search for chains of length >= 3 using DFS
    qualifying_chains: List[Dict[str, Any]] = []
    peel_wallets: Set[str] = set()

    for start_node in peel_hop_info:
        # Build path forward
        chain = [start_node]
        curr = start_node

        while curr in peel_hop_info:
            nxt = peel_hop_info[curr]["main_target"]
            t_curr = peel_hop_info[curr]["timestamp"]
            t_nxt = peel_hop_info[nxt]["timestamp"] if nxt in peel_hop_info else 0.0

            # Check time window if timestamps are available
            if t_curr > 0 and t_nxt > 0 and (t_nxt - t_curr) > PEEL_WINDOW_SECONDS:
                break
            if nxt in chain:
                # Cycle prevention
                break

            chain.append(nxt)
            curr = nxt

        # Check if chain has >= PEEL_MIN_HOPS (k hops means k+1 nodes)
        if len(chain) >= PEEL_MIN_HOPS + 1:
            is_cash_out = chain[-1] in off_ramp_set or get_label_type(chain[-1]) == "vasp"
            qualifying_chains.append({
                "nodes": chain,
                "hops": len(chain) - 1,
                "cash_out_peel": is_cash_out,
                "start": chain[0],
                "end": chain[-1],
            })
            for node in chain:
                peel_wallets.add(node)

    return peel_wallets, qualifying_chains


def compute_forwarding_latency(
    transfers: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    """
    Computes receive -> forward latency L_r for each wallet.
    For each non-dust inbound transfer r (amount a_r, time t_r),
    finds earliest outbound transfers within 24h whose cumulative amount reaches >= 0.9 a_r.
    L_med = median(L_r). Requires >= 2 matched flows.
    Supports both Ethereum and Solana native transfers.
    """
    native_txs = [
        t for t in transfers
        if t.get("assetType", "eth") in ("eth", "sol") and not is_dust(t.get("amount", 0.0))
    ]

    in_by_node: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    out_by_node: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    for t in native_txs:
        src = normalize_address(t["source"])
        tgt = normalize_address(t["target"])
        in_by_node[tgt].append(t)
        out_by_node[src].append(t)

    results: Dict[str, Dict[str, Any]] = {}
    all_wallets = set(in_by_node.keys()) | set(out_by_node.keys())

    for w in all_wallets:
        if get_label_type(w) != "none":
            continue

        in_txs = in_by_node.get(w, [])
        out_txs = out_by_node.get(w, [])

        if not in_txs or not out_txs:
            continue

        # Sort out_txs by timestamp
        sorted_out = sorted(out_txs, key=lambda x: _parse_timestamp(x.get("blockTimestamp") or x.get("timestamp")))

        latencies: List[float] = []

        for r in in_txs:
            a_r = float(r.get("amount", 0.0))
            t_r = _parse_timestamp(r.get("blockTimestamp") or r.get("timestamp"))
            if t_r <= 0 or a_r <= 0:
                continue

            target_amt = FWD_MATCH_RATIO * a_r
            cum_amt = 0.0
            matched_time = None

            for o in sorted_out:
                t_o = _parse_timestamp(o.get("blockTimestamp") or o.get("timestamp"))
                if t_o < t_r:
                    continue
                if (t_o - t_r) > FWD_WINDOW_SECONDS:
                    break

                cum_amt += float(o.get("amount", 0.0))
                if cum_amt >= target_amt:
                    matched_time = t_o
                    break

            if matched_time is not None:
                latencies.append(max(0.0, matched_time - t_r))

        if len(latencies) >= FWD_MIN_FLOWS:
            median_latency = float(np.median(latencies))
            is_fast = median_latency < FAST_FWD_SECONDS
            is_very_fast = median_latency < VERY_FAST_FWD_SECONDS
            results[w] = {
                "evaluated": True,
                "median_latency_seconds": median_latency,
                "matched_flows": len(latencies),
                "fast": 1 if is_fast else 0,
                "very_fast": 1 if is_very_fast else 0,
            }
        else:
            results[w] = {
                "evaluated": False,
                "median_latency_seconds": None,
                "matched_flows": len(latencies),
                "fast": 0,
                "very_fast": 0,
            }

    return results


def compute_pattern_evidence(
    transfers: List[Dict[str, Any]],
    wallets: Set[str],
    off_ramp_set: Set[str] | None = None,
) -> Dict[str, Dict[str, Any]]:
    """
    Computes composite pattern(v) for all wallets according to Section 3 Stage 3:
    pattern(v) = 1 - (1 - w_peel * peel(v)) * (1 - w_fast * fast(v))
    Returns {address: {"pattern": float, "peel": int, "fast": int, "very_fast": int, ...}}
    Supports both Ethereum and Solana addresses.
    """
    peel_wallets, qualifying_chains = detect_peel_chains(transfers, off_ramp_set=off_ramp_set)
    fwd_info = compute_forwarding_latency(transfers)

    evidence: Dict[str, Dict[str, Any]] = {}

    for w in wallets:
        w_norm = normalize_address(w)
        if get_label_type(w_norm) != "none":
            rec = {
                "pattern": 0.0,
                "peel": 0,
                "fast": 0,
                "very_fast": 0,
                "peel_member": False,
            }
            evidence[w] = rec
            evidence[w_norm] = rec
            continue

        peel_flag = 1 if (w_norm in peel_wallets or w in peel_wallets) else 0
        fwd_res = fwd_info.get(w_norm, fwd_info.get(w, {"fast": 0, "very_fast": 0}))
        fast_flag = fwd_res.get("fast", 0)

        pattern_val = 1.0 - (1.0 - W_PEEL * peel_flag) * (1.0 - W_FAST * fast_flag)

        rec = {
            "pattern": float(round(pattern_val, 4)),
            "peel": peel_flag,
            "fast": fast_flag,
            "very_fast": fwd_res.get("very_fast", 0),
            "median_latency": fwd_res.get("median_latency_seconds"),
            "peel_member": peel_flag == 1,
        }
        evidence[w] = rec
        evidence[w_norm] = rec

    return evidence

