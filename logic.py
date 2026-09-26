import os
from datetime import datetime
from dotenv import load_dotenv
import networkx as nx
from config import KNOWN_VASPS

def check_for_vasp(G, start_node):
    """Checks if there is a path from the victim to any known exchange."""
    for vasp in KNOWN_VASPS:
        vasp_lower = vasp.lower()
        if vasp_lower in G.nodes:
            try:
                path = nx.shortest_path(G, source=start_node.lower(), target=vasp_lower)
                print(f"\n[ALERT] Funds reached known VASP: {vasp}")
                print(" -> ".join(path))
                return True
            except nx.NetworkXNoPath:
                continue
    return False

def detect_next_suspicious_wallets(G, current_wallet):
    """
    Returns a list of receiving wallets that look like part of a peel chain 
    (i.e., received a large percentage of the outgoing funds).
    """
    suspicious_receivers = []
    current_wallet = current_wallet.lower()
    
    if current_wallet not in G.nodes:
        return suspicious_receivers

    out_edges = list(G.out_edges(current_wallet, data=True))
    if not out_edges:
        return suspicious_receivers

    total_out = sum([data['weight'] for _, _, data in out_edges])
    
    for _, receiver, data in out_edges:
        if total_out > 0:
            percentage = (data['weight'] / total_out) * 100
            if percentage >= 20.0:
                suspicious_receivers.append(receiver)
                
    return suspicious_receivers