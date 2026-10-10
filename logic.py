"""
logic.py
--------
NetworkX graph helpers for VASP checking and next-hop exploration.
Aligned with risk_score.md v2.1 specifications with calibrated peel-chain logic.
"""

from typing import List
import networkx as nx
from normalize import LABELS, is_dust, PEEL_MAIN_MIN, PEEL_MAIN_MAX, get_label_type


def check_for_vasp(G: nx.DiGraph, start_node: str) -> bool:
    """Checks if there is an active path from start_node to any known VASP off-ramp."""
    start_lower = start_node.lower().strip()
    if start_lower not in G.nodes:
        return False

    vasp_addrs = [addr for addr, info in LABELS.items() if info.get("type") == "vasp"]

    for vasp in vasp_addrs:
        if vasp in G.nodes:
            try:
                path = nx.shortest_path(G, source=start_lower, target=vasp)
                vasp_name = LABELS.get(vasp, {}).get("name", "Unknown VASP")
                print(f"\n[ALERT] Funds reached known VASP: {vasp_name} ({vasp})")
                print(" -> ".join(path))
                return True
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                continue
    return False


def detect_next_suspicious_wallets(G: nx.DiGraph, current_wallet: str) -> List[str]:
    """
    Returns receiving wallets that qualify as suspicious peel-chain hops.
    Filters out dust transfers, halts crawl at known VASPs/mixers/bridges,
    and removes redundant broad splits (e.g. >= 25%) that inflate risk on benign wallets.
    """
    suspicious_receivers: List[str] = []
    current_wallet = current_wallet.lower().strip()

    if current_wallet not in G.nodes:
        return suspicious_receivers

    out_edges = list(G.out_edges(current_wallet, data=True))
    if not out_edges:
        return suspicious_receivers

    # Exclude dust edges prior to calculating outbound volume
    valid_edges = [
        (src, dst, data)
        for src, dst, data in out_edges
        if not is_dust(data.get("weight", 0.0))
    ]

    total_out = sum(data.get("weight", 0.0) for _, _, data in valid_edges)
    if total_out <= 0:
        return suspicious_receivers

    # A genuine peel chain has low fan-out (typically 2 branches: 1 peel + 1 main trunk)
    num_branches = len(valid_edges)

    for _, receiver, data in valid_edges:
        rec_lower = receiver.lower().strip()

        # Circuit breaker: Never follow past known VASPs, mixers, or bridges
        if get_label_type(rec_lower) in {"vasp", "mixer", "bridge"}:
            continue

        share = data.get("weight", 0.0) / total_out

        # Calibrated Peel Check:
        # 1. Must fall strictly in the peel-chain main trunk band (70% to 99.5%)
        # 2. Must not be an ordinary multi-send distribution/airdrop (branch count <= 4)
        if PEEL_MAIN_MIN <= share <= PEEL_MAIN_MAX and num_branches <= 4:
            suspicious_receivers.append(rec_lower)

    return suspicious_receivers