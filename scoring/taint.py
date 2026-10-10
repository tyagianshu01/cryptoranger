"""
scoring/taint.py
----------------
Stage 2: Forward-Only Taint (Haircut Model)
Implements Section 3 (Stage 2) of risk_score.md.
"""

from collections import deque, defaultdict
from typing import Dict, List, Set, Any
from normalize import GAMMA, MAX_HOPS, is_dust, get_label_type


def compute_forward_taint(
    origin_set: Set[str],
    transfers: List[Dict[str, Any]],
    gamma: float = GAMMA,
    max_hops: int = MAX_HOPS,
    victim_wallets: Set[str] | None = None,
) -> Dict[str, float]:
    """
    Computes forward-only haircut taint propagation from origin_set.

    Args:
        origin_set: Set of origin wallet addresses (e.g. {root} or 1st-hop recipients).
        transfers: List of transfer dictionaries with keys:
                   'source', 'target', 'amount' (in ETH), 'assetType' ('eth'/'token').
        gamma: Per-hop retention factor (default 0.9).
        max_hops: Maximum wallet-to-wallet hops (default 5).
        victim_wallets: Wallets that must never receive taint (e.g. reporting victims).

    Returns:
        Dict mapping lowercase wallet address to taint value in [0.0, 1.0].
    """
    if victim_wallets is None:
        victim_wallets = set()
    victim_wallets = {v.lower().strip() for v in victim_wallets}
    origin_set = {s.lower().strip() for s in origin_set}

    # Filter to valid non-dust native ETH transfers only (Stage 0 scoring scope)
    eth_transfers = [
        t for t in transfers
        if t.get("assetType", "eth") == "eth" and not is_dust(t.get("amount", 0.0))
    ]

    # Pre-calculate total non-dust ETH inflow for each wallet
    inflow_eth: Dict[str, float] = defaultdict(float)
    out_edges: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    in_edges: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    for t in eth_transfers:
        u = t["source"].lower().strip()
        v = t["target"].lower().strip()
        amt = float(t.get("amount", 0.0))
        inflow_eth[v] += amt
        out_edges[u].append(t)
        in_edges[v].append(t)

    # Step 1: Initialize taint
    taint: Dict[str, float] = defaultdict(float)
    for s in origin_set:
        taint[s] = 1.0

    # Step 2: Layered BFS from origin_set along OUTGOING transfers only
    layers: Dict[int, Set[str]] = defaultdict(set)
    node_layer: Dict[str, int] = {}

    for s in origin_set:
        layers[0].add(s)
        node_layer[s] = 0

    q: deque[tuple[str, int]] = deque([(s, 0) for s in origin_set])
    visited: Set[str] = set(origin_set)

    while q:
        curr, depth = q.popleft()
        if depth >= max_hops:
            continue

        # Stop propagation beyond VASPs, mixers, or bridges
        curr_label = get_label_type(curr)
        if curr_label in {"vasp", "mixer", "bridge"} and depth > 0:
            continue

        for t in out_edges[curr]:
            nxt = t["target"].lower().strip()
            # Victims and origin set cannot be added to later layers
            if nxt in victim_wallets or nxt in origin_set:
                continue

            if nxt not in visited:
                visited.add(nxt)
                node_layer[nxt] = depth + 1
                layers[depth + 1].add(nxt)
                q.append((nxt, depth + 1))

    # Step 3: Compute taint layer by layer (k >= 1)
    for k in range(1, max_hops + 1):
        for v in layers[k]:
            if v in victim_wallets:
                taint[v] = 0.0
                continue

            tot_inflow = inflow_eth.get(v, 0.0)
            if tot_inflow <= 0.0:
                taint[v] = 0.0
                continue

            # Sum over non-dust transfers from strictly earlier layers
            tainted_incoming = 0.0
            for t in in_edges[v]:
                u = t["source"].lower().strip()
                u_layer = node_layer.get(u)
                if u_layer is not None and u_layer < k:
                    tainted_incoming += taint[u] * float(t.get("amount", 0.0))

            t_val = min(1.0, gamma * (tainted_incoming / tot_inflow))
            taint[v] = max(0.0, t_val)

    # Ensure victims always have zero taint
    for vic in victim_wallets:
        taint[vic] = 0.0

    return taint
