"""
logic.py
--------
NetworkX graph helpers for VASP checking and next-hop exploration.
Aligned with risk_score.md v2.1 specifications with calibrated peel-chain logic.
"""
import os
from datetime import datetime
from dotenv import load_dotenv

from typing import List
import networkx as nx
from config import KNOWN_VASPS, SOLANA_KNOWN_VASPS, SOLANA_EXCLUDED_ACCOUNTS
from normalize import LABELS, is_dust, PEEL_MAIN_MIN, PEEL_MAIN_MAX, get_label_type

def check_for_vasp(G, start_node, chain="ETH"):
    """Checks if there is a path from the victim to any known exchange.
    
    For ETH: checks KNOWN_VASPS (hex, case-insensitive).
    For SOL: checks SOLANA_KNOWN_VASPS (base58, case-SENSITIVE).
    """
    is_sol = chain.upper() == "SOL"
    
    # Solana base58 addresses are case-sensitive — never call .lower()
    source = start_node.strip() if is_sol else start_node.strip().lower()
    
    if source not in G.nodes:
        return False
    
    if is_sol:
        target_vasps = list(SOLANA_KNOWN_VASPS.keys())
    else:
        target_vasps = [addr for addr, info in LABELS.items() if info.get("type") == "vasp"]

    
    for vasp in target_vasps:
        if vasp in G.nodes:
            try:
                path = nx.shortest_path(G, source=source, target=vasp)
                label = SOLANA_KNOWN_VASPS.get(vasp, vasp) if is_sol else LABELS.get(vasp, {}).get("name", "Unknown VASP")
                print(f"\n[ALERT] Funds reached known VASP ({chain}): {label}")
                print(" -> ".join(path))
                return True
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                continue
    return False

def detect_next_suspicious_wallets(G, current_wallet, chain="ETH"):
    """
    Returns a list of receiving wallets that look like part of a peel chain 
    (i.e., received a large percentage of the outgoing funds).
    
    For SOL: filters out known system programs and DEX routers to prevent
    the BFS from following infrastructure accounts into infinite loops.
    """
    is_sol = chain.upper() == "SOL"
    suspicious_receivers = []
    
    # Solana base58 addresses are case-sensitive — never call .lower()
    current_wallet = current_wallet.strip() if is_sol else current_wallet.strip().lower()
    
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
    excluded = SOLANA_EXCLUDED_ACCOUNTS if is_sol else set()
    # A genuine peel chain has low fan-out (typically 2 branches: 1 peel + 1 main trunk)
    num_branches = len(valid_edges)

    for _, receiver, data in valid_edges:
        rec_lower=receiver.strip() if is_sol else receiver.lower().strip()
        if is_sol and rec_lower in excluded:
            continue
        if not is_sol and get_label_type(rec_lower) in {"vasp", "mixer", "bridge"}:
            continue

        share = data.get("weight", 0.0) / total_out

        # Calibrated Peel Check:
        # 1. Must fall strictly in the peel-chain main trunk band (70% to 99.5%)
        # 2. Must not be an ordinary multi-send distribution/airdrop (branch count <= 4)
        if PEEL_MAIN_MIN <= share <= PEEL_MAIN_MAX and num_branches <= 4:
            suspicious_receivers.append(rec_lower)

    return suspicious_receivers