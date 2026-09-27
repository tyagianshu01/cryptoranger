from tracer import trace_funds
from config import KNOWN_VASPS,NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
# ==========================================
from fastapi import FastAPI, BackgroundTasks
from routers import analysis, cypher, chat
from fastapi.middleware.cors import CORSMiddleware
from neo4j import GraphDatabase

app = FastAPI(title="Crypto Fraud Tracing API")
app.include_router(analysis.router)
app.include_router(cypher.router)
app.include_router(chat.router)

# CORS setup (Taaki React frontend block na ho)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Neo4j Database details from the frontend team's code
URI = NEO4J_URI
AUTH = (NEO4J_USER, NEO4J_PASSWORD) # Yahan apna database password daalna

@app.get("/")
def home():
    return {"message": "Crypto API Server is Live!"}

from pydantic import BaseModel

class AnalyzeRequest(BaseModel):
    txId: str
    limit: int = 100
    epochSeconds: int = 0

@app.post("/analyze-wallet")
def analyze_wallet(req: AnalyzeRequest):
    wallet_id = req.txId.strip()

    # ==============================================================
    # 1. FETCH DATA (Etherscan -> Neo4j via Tracer)
    # ==============================================================
    ml_flagged = []
    if wallet_id != "Unknown":
        print(f"[+] API Triggered! (Limit: {req.limit} | Epoch: {req.epochSeconds}) Fetching live trace for: {wallet_id}")
        ml_flagged = trace_funds(wallet_id, max_depth=1, limit=req.limit)
    
    # ==============================================================
    # 2. BUILD GRAPH (Neo4j -> Backend Computation -> React)
    # ==============================================================
    raw_nodes = {}
    raw_edges = []

    # Strictly directed matching prevents double-counting that zeros out the balances
    cypher_specific = """
    MATCH (n:Wallet)-[:SENT|SENT_TOKEN]->(tx)-[:TO|TOKEN_TO]->(m:Wallet)
    WHERE (toLower(n.address) = toLower($wallet_id) OR toLower(m.address) = toLower($wallet_id))
          AND ($epoch = 0 OR tx.timestamp.epochSeconds >= $epoch)
    RETURN n, tx AS rel, m
    LIMIT 1000
    """

    def get_addr(node_obj):
        return node_obj.get("eth_address") or node_obj.get("address") or str(node_obj.element_id)

    try:
        with GraphDatabase.driver(URI, auth=AUTH) as driver:
            records, _, _ = driver.execute_query(
                cypher_specific, wallet_id=wallet_id, epoch=req.epochSeconds
            )

            for record in records:
                n   = record["n"]
                m   = record["m"]
                rel = record["rel"]

                n_id = str(n.element_id)
                m_id = str(m.element_id)

                if n_id not in raw_nodes:
                    raw_nodes[n_id] = get_addr(n)
                if m_id not in raw_nodes:
                    raw_nodes[m_id] = get_addr(m)

                # Ensure we check both normal ETH and ERC20 Token values!
                amount = float(rel.get("value_eth") or rel.get("value_token") or rel.get("amount") or rel.get("value") or 0.0)
                
                # Fetch token symbol if available to enrich the edge label
                symbol = rel.get("token_symbol") or "ETH"
                
                is_outbound = (n_id in raw_nodes and raw_nodes[n_id].lower() == wallet_id.lower())
                
                raw_edges.append({
                    "id": f"{n_id}->{m_id}",
                    "source": n_id,
                    "target": m_id,
                    "label": f"{amount:.4f} {symbol}",
                    "amount": amount,
                    "txHash": rel.get("hash", ""),
                    "timestamp": str(rel.get("timestamp", "")),
                    "flowDirection": "outbound" if is_outbound else "inbound",
                    "assetType": "eth" if symbol == "ETH" else "token"
                })

    except Exception as e:
        print("Neo4j Error:", e)
        
    # ==============================================================
    # 3. GRAPH ALGORITHMS & MATHEMATICAL SCORING (Option B)
    # ==============================================================
    import math
    from datetime import datetime

    node_stats = {}
    real_edges = []
    
    total_value = 0.0
    for i, e in enumerate(raw_edges):
        amt = e["amount"]
        total_value += amt
        src = e["source"]
        tgt = e["target"]
        
        if src not in node_stats: node_stats[src] = {"txCount": 0, "balance": 0.0, "volume": 0.0, "inTxs": 0, "outTxs": 0}
        if tgt not in node_stats: node_stats[tgt] = {"txCount": 0, "balance": 0.0, "volume": 0.0, "inTxs": 0, "outTxs": 0}
        
        node_stats[src]["txCount"] += 1
        node_stats[src]["outTxs"] += 1
        node_stats[src]["balance"] -= amt
        node_stats[src]["volume"] += amt
        
        node_stats[tgt]["txCount"] += 1
        node_stats[tgt]["inTxs"] += 1
        node_stats[tgt]["balance"] += amt
        node_stats[tgt]["volume"] += amt
        
        real_edges.append({
            "id": e["id"],
            "source": src,
            "target": tgt,
            "type": "normal",
            "amount": amt,
            "amountUsd": amt * 2100,
            "percent": 100,
            "txHash": e["txHash"],
            "blockTimestamp": e["timestamp"],
            "flowDirection": e["flowDirection"],
            "assetType": e["assetType"]
        })
        
    max_tx_count = max([s["txCount"] for s in node_stats.values()]) if node_stats else 1
    
    ALPHA = 0.6
    W_C = 0.4
    W_V = 0.6
    
    real_nodes = []
    # Count total unique nodes to scale degree centrality
    total_nodes_count = len(raw_nodes) if len(raw_nodes) > 0 else 1

    for nid, addr in raw_nodes.items():
        stats = node_stats.get(nid, {"txCount": 1, "balance": 0.0, "volume": 0.0, "inTxs": 0, "outTxs": 0})
        is_root = addr.lower() == wallet_id.lower()
        
        # Lower ML impact for root to prevent auto-maxing out, isolate ML to specific flagged wallets
        is_ml_flagged = addr.lower() in ml_flagged
        ml_base = (75 if is_ml_flagged else 15) if is_root else (45 if is_ml_flagged else 5)
        
        # Prevent 100% degree centrality just because it's a simple 1-depth trace
        degree_centrality = (stats["txCount"] / max_tx_count) * (min(total_nodes_count, 100) / 100.0)
        
        # Require 1,000,000+ volume to hit max log_volume score
        log_volume = min(6.0, math.log10(stats["volume"] + 1)) / 6.0
        
        structural_score = (W_C * degree_centrality + W_V * log_volume) * 100
        R_v = ALPHA * ml_base + (1 - ALPHA) * structural_score
        
        velocity_penalty = 0.0
        if stats["inTxs"] > 0 and stats["outTxs"] > 0 and abs(stats["balance"]) < (stats["volume"] * 0.1) and stats["txCount"] > 5:
            velocity_penalty = 0.20
            
        R_v = min(98.0, R_v * (1 + velocity_penalty))
        final_risk = round(R_v)
        
        real_nodes.append({
            "id": nid,
            "label": addr,
            "address": addr,
            "type": "suspect" if final_risk >= 75 else "intermediate",
            "riskScore": final_risk,
            "balance": abs(stats["balance"]),
            "balanceUsd": abs(stats["balance"]) * 2100,
            "firstSeen": datetime.utcnow().isoformat() + "Z",
            "lastActive": datetime.utcnow().isoformat() + "Z",
            "txCount": stats["txCount"],
            "hopDepth": 0 if is_root else 1,
            "flagged": final_risk >= 75,
            "chain": "ETH",
            "clusterIds": [],
            "mathMetrics": {
                "degreeCentrality": round(degree_centrality, 4),
                "logVolume": round(log_volume, 4),
                "velocityPenalty": round(velocity_penalty, 4),
                "mlBase": ml_base
            }
        })

    # ==============================================================
    # 3.5. GRAPH TAINT CONTAGION (Guilt By Association)
    # ==============================================================
    root_node = next((n for n in real_nodes if n["address"].lower() == wallet_id.lower()), None)
    root_risk = root_node["riskScore"] if root_node else 0

    if root_risk >= 75:
        # Radiate mathematical taint onto counterparties
        for n in real_nodes:
            if n["address"].lower() == wallet_id.lower():
                continue
                
            stats = node_stats.get(n["id"], {"volume": 0.0})
            
            # Scale constraint: log10(1000) ~ 3.0 -> full contagion penalty
            contagion_factor = min(1.0, math.log10(stats["volume"] + 1) / 3.0)
            
            # Only radiate if the root itself is actually dangerous (not just leaking)
            taint_penalty = (root_risk * 0.45) * contagion_factor if root_risk >= 75 else 0
            
            n["riskScore"] = min(99, round(n["riskScore"] + taint_penalty))
            
            if n["riskScore"] >= 75:
                n["type"] = "suspect"
                n["flagged"] = True

    # ==============================================================
    # 4. LEDGER & AUDIT CALCULATION (Moved from Frontend)
    # ==============================================================
    ledger_transactions = []
    
    # Create lookup map for fast O(1) risk and address fetching
    node_lookup = {n["id"]: n for n in real_nodes}

    for e in real_edges:
        src_node = node_lookup.get(e["source"])
        tgt_node = node_lookup.get(e["target"])
        
        src_addr = src_node["address"] if src_node else e["source"]
        tgt_addr = tgt_node["address"] if tgt_node else e["target"]
        
        src_risk = src_node["riskScore"] if src_node else 0
        tgt_risk = tgt_node["riskScore"] if tgt_node else 0
        
        # Isolate Counterparty Risk (ignore the root wallet's own risk for ledger scoping)
        if src_addr.lower() == wallet_id.lower():
            tx_risk = tgt_risk
        elif tgt_addr.lower() == wallet_id.lower():
            tx_risk = src_risk
        else:
            tx_risk = max(src_risk, tgt_risk)
        
        # Sterile Government-grade typography logic
        if tx_risk >= 75:
            risk_color = '#DC2626' # Stark Red for anomalies
        else:
            risk_color = 'var(--color-text-muted)' # Neutral UI text for safe nodes
            
        ledger_transactions.append({
            "id": e["id"],
            "timestamp": e["blockTimestamp"],
            "amountEth": e["amount"],
            "amountUsd": e["amountUsd"],
            "fromAddress": src_addr,
            "toAddress": tgt_addr,
            "riskScore": tx_risk,
            "riskColor": risk_color
        })
        
    # Chronological backend sort before leaving system
    ledger_transactions.sort(key=lambda t: t["timestamp"], reverse=True)

    return {
        "wallet_analyzed": wallet_id,
        "ml_fraud_prediction_hit": len(ml_flagged) > 0,
        "graph_data": {"nodes": real_nodes, "edges": real_edges},
        "ledger_transactions": ledger_transactions
    }



if __name__ == "__main__":
    import uvicorn
    # Let's default to running the server, or testing the ML standalone
    print("Run module via uvicorn for frontend API: uvicorn main:app --reload")
    # For a quick manual test of the ML logic independent of the API:
    # VICTIM_WALLET = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
    # trace_funds(VICTIM_WALLET, max_depth=3)