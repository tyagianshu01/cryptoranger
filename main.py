"""
main.py
-------
CryptoTracker Sentinel — Forensic Tracing & Risk Scoring API (v2.1)
Implements Sections 3, 4, 5, and 6 of risk_score.md.
"""

from __future__ import annotations

import math
import os
import re
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Set

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from neo4j import GraphDatabase
from pydantic import BaseModel

from config import KNOWN_VASPS, NEO4J_PASSWORD, NEO4J_URI, NEO4J_USER
from normalize import (
    DUST_ETH,
    ELEVATED_CUTOFF,
    P_REPORT,
    SUSPECT_CUTOFF,
    W_TAINT,
    get_label_info,
    get_label_type,
    get_origin_set,
    is_dust,
    wei_to_eth,
)
from routers import analysis, chat, cypher, graphrag_router
from graphrag import GraphRAGService
from scoring.offramp import evaluate_off_ramp_leads
from scoring.patterns import compute_pattern_evidence, detect_peel_chains
from scoring.taint import compute_forward_taint
from tracer import evaluate_wallet_ml, trace_funds

app = FastAPI(title="CryptoTracker Sentinel — Forensic Tracing API (v2.1)")
app.include_router(analysis.router)
app.include_router(cypher.router)
app.include_router(chat.router)
app.include_router(graphrag_router.router)

@app.on_event("startup")
async def startup_event():
    import asyncio
    asyncio.create_task(GraphRAGService.get_instance().initialize_index())

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

URI = NEO4J_URI
AUTH = (NEO4J_USER, NEO4J_PASSWORD)

_ETH_ADDR_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
_SOL_ADDR_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")


class AnalyzeRequest(BaseModel):
    txId: str
    limit: Optional[int] = None  # None or 100 defaults to 5 for SOL, 100 for ETH
    epochSeconds: int = 0
    reported_role: Literal["suspect", "victim"] = "suspect"
    chain: Optional[str] = None  # "ETH", "SOL", or None for auto-detect


@app.get("/")
def home():
    return {"message": "CryptoTracker Sentinel API is Live (v2.1 — Calibrated ML & Haircut Taint)"}


@app.post("/analyze-wallet")
def analyze_wallet(req: AnalyzeRequest):
    raw_addr = req.txId.strip()

    # Auto-detect chain from address format if not explicitly provided
    if req.chain:
        chain = req.chain.upper()
    elif _ETH_ADDR_RE.match(raw_addr.lower()):
        chain = "ETH"
    elif _SOL_ADDR_RE.match(raw_addr):
        chain = "SOL"
    else:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unrecognized address format: '{req.txId}'. "
                "Expected an Ethereum address (0x + 40 hex chars) "
                "or a Solana address (32-44 Base58 chars)."
            ),
        )

    is_sol = chain == "SOL"
    # Solana Base58 addresses are case-sensitive — NEVER lowercase them
    wallet_id = raw_addr if is_sol else raw_addr.lower()

    # Solana public RPC aggressively rate-limits with HTTP 429 when fetching 100 transactions.
    # Default to 5 if req.limit was unspecified or left at default 100.
    if req.limit is None:
        limit_to_use = 5 if is_sol else 100
    elif is_sol and req.limit == 100:
        limit_to_use = 5
    else:
        limit_to_use = req.limit

    # ==============================================================
    # 1. FETCH DATA + CONTINUOUS BFS TRACE (both ETH and SOL)
    # ==============================================================
    ml_evaluations: Dict[str, Dict[str, Any]] = {}
    if wallet_id != "unknown":
        print(f"[+] API Triggered! (Chain: {chain} | Limit: {limit_to_use} | Epoch: {req.epochSeconds} | Role: {req.reported_role}) Target: {wallet_id}")
        ml_evaluations = trace_funds(wallet_id, max_depth=1, limit=limit_to_use, chain=chain)

    # ==============================================================
    # 2. IN-SCOPE NEIGHBOURHOOD (Ordered Query + Truncation Check)
    # ==============================================================
    # Chain-specific Cypher queries
    if is_sol:
        cypher_specific = """
        MATCH (n:Account)-[r:TRANSFERRED]->(m:Account)
        WHERE (n.address = $wallet_id OR m.address = $wallet_id)
        RETURN n, r AS rel, m
        ORDER BY r.timestamp ASC
        LIMIT 1001
        """
    else:
        cypher_specific = """
        MATCH (n:Wallet)-[:SENT|SENT_TOKEN]->(tx)-[:TO|TOKEN_TO]->(m:Wallet)
        WHERE (toLower(n.address) = toLower($wallet_id) OR toLower(m.address) = toLower($wallet_id))
              AND ($epoch = 0 OR tx.timestamp.epochSeconds >= $epoch)
        RETURN n, tx AS rel, m
        ORDER BY tx.timestamp.epochSeconds ASC
        LIMIT 1001
        """

    raw_nodes: Dict[str, str] = {}
    raw_edges: List[Dict[str, Any]] = []
    is_truncated = False

    def get_addr(node_obj):
        return node_obj.get("eth_address") or node_obj.get("address") or str(node_obj.element_id)

    # USD price multiplier per chain
    usd_price = 150.0 if is_sol else 2100.0

    try:
        with GraphDatabase.driver(URI, auth=AUTH) as driver:
            # Ensure root wallet has ML features evaluated even if tracer skipped it
            # ML model is trained on ETH features only — skip for SOL
            if not is_sol and wallet_id not in ml_evaluations:
                ml_evaluations[wallet_id] = evaluate_wallet_ml(driver, wallet_id, is_full_history=(limit_to_use >= 1000 and req.epochSeconds == 0))

            query_params = {"wallet_id": wallet_id}
            if not is_sol:
                query_params["epoch"] = req.epochSeconds

            records, _, _ = driver.execute_query(
                cypher_specific, **query_params
            )

            # Explicit truncation check
            if len(records) > 1000:
                is_truncated = True
                records = records[:1000]

            for record in records:
                n = record["n"]
                m = record["m"]
                rel = record["rel"]

                # Solana addresses are case-sensitive; ETH are lowercased
                if is_sol:
                    n_addr = str(get_addr(n)).strip()
                    m_addr = str(get_addr(m)).strip()
                else:
                    n_addr = str(get_addr(n)).lower().strip()
                    m_addr = str(get_addr(m)).lower().strip()

                raw_nodes[n_addr] = n_addr
                raw_nodes[m_addr] = m_addr

                if is_sol:
                    # Solana: direct transfer edges carry amount, token, signature, timestamp
                    token = str(rel.get("token") or "SOL").upper()
                    amount_val = float(rel.get("amount") or 0.0)
                    is_outbound = (n_addr == wallet_id)
                    sig = str(rel.get("signature") or "")
                    ts = rel.get("timestamp") or 0

                    raw_edges.append({
                        "id": f"{n_addr}->{m_addr}_{sig[:10]}",
                        "source": n_addr,
                        "target": m_addr,
                        "label": f"{amount_val:.4f} {token}",
                        "amount": amount_val,
                        "amountUsd": amount_val * usd_price if token == "SOL" else 0.0,
                        "txHash": sig,
                        "timestamp": str(ts),
                        "blockTimestamp": ts,
                        "flowDirection": "outbound" if is_outbound else "inbound",
                        "assetType": "sol" if token == "SOL" else "token",
                        "symbol": token,
                        "isDust": False,
                    })
                else:
                    # ETH: tripartite model — Wallet->Transaction->Wallet
                    symbol = str(rel.get("token_symbol") or "ETH").upper()
                    is_native_eth = symbol == "ETH"

                    if is_native_eth:
                        val_eth = rel.get("value_eth")
                        if val_eth is None:
                            val_raw = rel.get("amount") or rel.get("value") or 0.0
                            val_eth = wei_to_eth(val_raw)
                        amount_val = float(val_eth)
                    else:
                        amount_val = float(rel.get("value_token") or rel.get("amount") or rel.get("value") or 0.0)

                    is_outbound = (n_addr == wallet_id)
                    dust_flag = is_native_eth and is_dust(amount_val)

                    raw_edges.append({
                        "id": f"{n_addr}->{m_addr}_{rel.get('hash', '')[:10]}",
                        "source": n_addr,
                        "target": m_addr,
                        "label": f"{amount_val:.4f} {symbol}" if not dust_flag else f"{amount_val:.6f} {symbol} (dust)",
                        "amount": amount_val,
                        "amountUsd": amount_val * usd_price if is_native_eth else 0.0,
                        "txHash": rel.get("hash", ""),
                        "timestamp": str(rel.get("timestamp", "")),
                        "blockTimestamp": rel.get("timestamp"),
                        "flowDirection": "outbound" if is_outbound else "inbound",
                        "assetType": "eth" if is_native_eth else "token",
                        "symbol": symbol,
                        "isDust": dust_flag,
                    })

    except Exception as e:
        print("Neo4j Error during wallet analysis:", e)

    # Ensure root wallet exists in raw_nodes
    raw_nodes[wallet_id] = wallet_id

    # ==============================================================
    # 3. STAGE 0 & 2: TAINT PROPAGATION (Forward Haircut Model)
    # ==============================================================
    native_asset = "sol" if is_sol else "eth"
    outbound_from_root = [e for e in raw_edges if e["source"] == wallet_id and e["assetType"] == native_asset]
    origin_set = get_origin_set(wallet_id, req.reported_role, outbound_from_root)
    victim_set = {wallet_id} if req.reported_role == "victim" else set()

    taint_map = compute_forward_taint(
        origin_set=origin_set,
        transfers=raw_edges,
        victim_wallets=victim_set,
    )

    # ==============================================================
    # 4. STAGE 3 & 5: BEHAVIOURAL PATTERNS & OFF-RAMP DISCOVERY
    # ==============================================================
    all_wallet_addrs = set(raw_nodes.keys())
    peel_wallets, peel_chains = detect_peel_chains(raw_edges)
    pattern_evidence = compute_pattern_evidence(raw_edges, all_wallet_addrs)
    off_ramp_leads = evaluate_off_ramp_leads(origin_set, raw_edges, taint_map, peel_chains)

    off_ramp_addrs = {o["address"].lower().strip() for o in off_ramp_leads["offRamps"]}
    probable_deposits = {
        o["depositAddress"].lower().strip()
        for o in off_ramp_leads["offRamps"]
        if o.get("depositAddress")
    }

    # ==============================================================
    # 5. STAGE 4: NOISY-OR EVIDENCE COMBINATION & ML GATE
    # ==============================================================
    node_stats: Dict[str, Dict[str, Any]] = defaultdict(
        lambda: {"txCount": 0, "balance": 0.0, "volume": 0.0, "inTxs": 0, "outTxs": 0}
    )

    for e in raw_edges:
        if e["assetType"] in ("eth", "sol") and not e["isDust"]:
            amt = e["amount"]
            src = e["source"]
            tgt = e["target"]

            node_stats[src]["txCount"] += 1
            node_stats[src]["outTxs"] += 1
            node_stats[src]["balance"] -= amt
            node_stats[src]["volume"] += amt

            node_stats[tgt]["txCount"] += 1
            node_stats[tgt]["inTxs"] += 1
            node_stats[tgt]["balance"] += amt
            node_stats[tgt]["volume"] += amt

    real_nodes = []
    ml_fraud_hit = False

    for addr in all_wallet_addrs:
        is_root = (addr == wallet_id)
        stats = node_stats[addr]
        label_info = get_label_info(addr)
        lbl_type = label_info["type"]

        # ML Evidence (Stage 1)
        ml_data = ml_evaluations.get(addr, {})
        p_ml = float(ml_data.get("p_ml", 0.0))
        ml_flag = bool(ml_data.get("ml_flag", False))
        ml_reliable = bool(ml_data.get("ml_reliable", not is_truncated))

        if ml_flag and ml_reliable:
            ml_fraud_hit = True

        # Taint Evidence (Stage 2)
        # Inside the Noisy-OR formula, taint of the origin itself is set to 0.0
        # because the origin's risk comes from ML, patterns, and prior
        taint_val = 0.0 if addr in origin_set else taint_map.get(addr, 0.0)

        # Pattern Evidence (Stage 3)
        pat_data = pattern_evidence.get(addr, {"pattern": 0.0})
        pattern_val = float(pat_data.get("pattern", 0.0))

        # Prior (Stage 4)
        prior_val = P_REPORT if (is_root and req.reported_role == "suspect") else 0.0

        # Noisy-OR combination:
        # P_illicit = 1 - (1 - p_ml) * (1 - w_taint * taint) * (1 - pattern) * (1 - prior)
        p_illicit = 1.0 - (
            (1.0 - p_ml)
            * (1.0 - W_TAINT * taint_val)
            * (1.0 - pattern_val)
            * (1.0 - prior_val)
        )
        p_illicit = max(0.0, min(1.0, p_illicit))
        r_score = min(99, int(round(100.0 * p_illicit)))

        # ML Gate (Section 3 Stage 4):
        # if ml_flag and ml_reliable and label_type == 'none': R(v) <- max(R(v), 75)
        if ml_flag and ml_reliable and lbl_type == "none":
            r_score = max(r_score, SUSPECT_CUTOFF)

        # Class Assignment (Strict order from Section 3 Stage 4):
        # 1. reported_role = victim and v = root -> victim
        # 2. label_type = vasp or probable deposit -> off_ramp
        # 3. R(v) >= 75 -> suspect
        # 4. otherwise -> intermediate
        if req.reported_role == "victim" and is_root:
            node_class = "victim"
            flagged = False
            r_score = 0
        elif lbl_type == "vasp" or addr in off_ramp_addrs or addr in probable_deposits:
            node_class = "off_ramp"
            flagged = False
        elif r_score >= SUSPECT_CUTOFF:
            node_class = "suspect"
            flagged = True
        else:
            node_class = "intermediate"
            flagged = False

        real_nodes.append({
            "id": addr,
            "label": label_info["name"] if lbl_type != "none" else addr,
            "address": addr,
            "type": node_class,
            "riskScore": r_score,
            "balance": abs(stats["balance"]),
            "balanceUsd": abs(stats["balance"]) * usd_price,
            "firstSeen": datetime.utcnow().isoformat() + "Z",
            "lastActive": datetime.utcnow().isoformat() + "Z",
            "txCount": stats["txCount"],
            "hopDepth": 0 if is_root else 1,
            "flagged": flagged,
            "chain": chain,
            "clusterIds": [],
            "mathMetrics": {
                "p_ml": round(p_ml, 4),
                "ml_flag": ml_flag,
                "ml_reliable": ml_reliable,
                "taint": round(taint_map.get(addr, 0.0), 4),
                "pattern": round(pattern_val, 4),
                "peel": pat_data.get("peel", 0),
                "fast_forward": pat_data.get("fast", 0),
                "prior": round(prior_val, 2),
                "label_type": lbl_type,
            },
        })

    # ==============================================================
    # 6. TRANSACTION-LEVEL RISK SCORING (Section 5)
    # ==============================================================
    node_lookup = {n["address"]: n for n in real_nodes}
    ledger_transactions = []
    real_edges = []

    for e in raw_edges:
        src_addr = e["source"]
        tgt_addr = e["target"]
        src_node = node_lookup.get(src_addr)
        tgt_node = node_lookup.get(tgt_addr)

        src_risk = src_node["riskScore"] if src_node else 0
        tgt_risk = tgt_node["riskScore"] if tgt_node else 0
        src_class = src_node["type"] if src_node else "intermediate"
        tgt_class = tgt_node["type"] if tgt_node else "intermediate"

        amt = e["amount"]
        is_token = e["assetType"] == "token"
        is_dust_tx = e["isDust"]

        # Transaction Risk (Section 5):
        # tx_risk(t) = max(round(100 * taint(u)), R(u) if class(u) == suspect else 0)
        src_taint = taint_map.get(src_addr, 0.0)
        if is_token:
            tx_risk = 0
            tag = "token (not scored)"
        elif is_dust_tx:
            tx_risk = min(20, int(round(100.0 * src_taint)))
            tag = "dust"
        else:
            suspect_sender_risk = src_risk if src_class == "suspect" else 0
            tx_risk = max(int(round(100.0 * src_taint)), suspect_sender_risk)
            tag = "standard"

        is_offramp_deposit = (tgt_class == "off_ramp") or (tgt_addr in off_ramp_addrs)
        if is_offramp_deposit:
            tag = "offramp_deposit"

        # Anomaly Coloring (Section 5):
        if is_offramp_deposit:
            risk_color = "#2563EB"  # Blue accent
        elif tx_risk >= SUSPECT_CUTOFF:
            risk_color = "#DC2626"  # Stark red
        elif tx_risk >= ELEVATED_CUTOFF:
            risk_color = "#D97706"  # Amber
        else:
            risk_color = "var(--color-text-muted)"

        real_edges.append({
            "id": e["id"],
            "source": src_addr,
            "target": tgt_addr,
            "type": "peel" if src_node and src_node.get("mathMetrics", {}).get("peel") == 1 else "normal",
            "amount": amt,
            "amountUsd": e.get("amountUsd", 0.0),
            "txHash": e["txHash"],
            "blockTimestamp": e["timestamp"],
            "flowDirection": e["flowDirection"],
            "assetType": e["assetType"],
            "tag": tag,
            "riskScore": tx_risk,
            "riskColor": risk_color,
        })

        ledger_transactions.append({
            "id": e["id"],
            "timestamp": e["timestamp"],
            "amountEth": amt,
            "amountUsd": e["amountUsd"],
            "symbol": e["symbol"],
            "fromAddress": src_addr,
            "toAddress": tgt_addr,
            "riskScore": tx_risk,
            "riskColor": risk_color,
            "tag": tag,
            "isDust": is_dust_tx,
            "assetType": e["assetType"],
        })

    # Sort ledger chronologically
    ledger_transactions.sort(key=lambda t: t["timestamp"], reverse=True)

    # ==============================================================
    # 7. OVERALL CASE RISK & SEVERITY TIERS (Section 6)
    # ==============================================================
    # Case risk = max R(v) over suspect and intermediate nodes (off-ramps and victims excluded)
    eligible_nodes = [
        n for n in real_nodes
        if n["type"] in {"suspect", "intermediate"}
    ]
    overall_risk = max([n["riskScore"] for n in eligible_nodes], default=0)

    if overall_risk >= SUSPECT_CUTOFF:
        severity_tier = "CRITICAL"
    elif overall_risk >= ELEVATED_CUTOFF:
        severity_tier = "ELEVATED"
    else:
        severity_tier = "LOW"

    return {
        "chain": chain,
        "wallet_analyzed": wallet_id,
        "reported_role": req.reported_role,
        "overallRisk": overall_risk,
        "severityTier": severity_tier,
        "truncated": is_truncated,
        "ml_fraud_prediction_hit": ml_fraud_hit,
        "graph_data": {"nodes": real_nodes, "edges": real_edges},
        "ledger_transactions": ledger_transactions,
        "off_ramp_leads": off_ramp_leads,
        "case_metrics": {
            "totalNodes": len(real_nodes),
            "totalEdges": len(real_edges),
            "suspectsCount": sum(1 for n in real_nodes if n["type"] == "suspect"),
            "offRampsCount": len(off_ramp_leads["offRamps"]),
            "peelChainsCount": len(peel_chains),
            "truncated": is_truncated,
        },
    }


if __name__ == "__main__":
    print("Run module via uvicorn for frontend API: python -m uvicorn main:app --reload")