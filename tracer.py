"""
tracer.py
---------
Stage 1: Calibrated ML Evidence (p_ml, ml_flag, ml_reliable)
Implements Section 3 (Stage 1) of risk_score.md.
"""

import json
import os
import time
from collections import deque
from typing import Dict, Any, List, Set, Tuple
import numpy as np
from config import KNOWN_VASPS, SOLANA_KNOWN_VASPS
from dataingestion import fetch_transactions
from solana_integration import ingest_solana_wallet
from db_connect import get_db_driver, store_in_neo4j, get_networkx_from_neo4j
from feature_extraction import get_ml_features
from logic import check_for_vasp, detect_next_suspicious_wallets

# --- ML Model & Calibration Loading ---
model = None
calibrator_data = None
tau_ml = 0.1769  # Default cutoff achieving precision >= 0.95 from PR curve
knots_x = [0.0, 1.0]
knots_y = [0.0, 1.0]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "pure_crypto_fraud_model.txt")
CALIBRATION_PATH = os.path.join(BASE_DIR, "ml_calibration.json")

try:
    import lightgbm as lgb
    if os.path.exists(MODEL_PATH):
        model = lgb.Booster(model_file=MODEL_PATH)
        print("ML Model (LightGBM Booster) loaded successfully. Inference enabled.")
    else:
        print(f"Notice: '{MODEL_PATH}' not found. Running in heuristic-only mode.")
except ImportError:
    print("Notice: lightgbm not installed. Heuristic-only mode.")

if os.path.exists(CALIBRATION_PATH):
    try:
        with open(CALIBRATION_PATH, "r") as f:
            calibrator_data = json.load(f)
            tau_ml = float(calibrator_data.get("tau_ml", 0.1769))
            knots_x = calibrator_data.get("knots_x", [0.0, 1.0])
            knots_y = calibrator_data.get("knots_y", [0.0, 1.0])
            print(f"ML Calibration loaded: tau_ml={tau_ml:.4f}, Brier={calibrator_data.get('brier_score')}")
    except Exception as e:
        print(f"Notice: Could not parse '{CALIBRATION_PATH}': {e}. Using default calibration.")


def evaluate_wallet_ml(driver, wallet_address: str, is_full_history: bool = True) -> Dict[str, Any]:
    """
    Extracts 45 wallet features from Neo4j, runs LightGBM, and converts
    the raw score into a calibrated probability p_ml(v) = Iso(s(v)).

    Args:
        driver: Active Neo4j driver.
        wallet_address: Target wallet address.
        is_full_history: True if feature history was not truncated.

    Returns:
        Dict containing:
          - raw_score: float in [0, 1]
          - p_ml: calibrated probability in [0, 1]
          - ml_flag: bool (p_ml >= tau_ml)
          - ml_reliable: bool
          - tau_ml: float cutoff
    """
    if model is None:
        return {
            "raw_score": 0.0,
            "p_ml": 0.0,
            "ml_flag": False,
            "ml_reliable": is_full_history,
            "tau_ml": tau_ml,
        }

    try:
        features_df = get_ml_features(driver, wallet_address)
        if features_df is None or features_df.empty:
            return {
                "raw_score": 0.0,
                "p_ml": 0.0,
                "ml_flag": False,
                "ml_reliable": False,
                "tau_ml": tau_ml,
            }

        # Predict using NumPy array to bypass any feature name string mismatches in LightGBM
        preds = model.predict(features_df.values)
        raw_score = float(preds[0])

        # Stage 1: Isotonic calibration map
        calibrated_prob = float(np.interp(raw_score, knots_x, knots_y))
        is_flagged = calibrated_prob >= tau_ml

        print(f"  [ML Inference] {wallet_address} -> Raw: {raw_score:.4f} | Calibrated p_ml: {calibrated_prob:.2%} | Flag: {is_flagged}")

        return {
            "raw_score": round(raw_score, 6),
            "p_ml": round(calibrated_prob, 6),
            "ml_flag": bool(is_flagged),
            "ml_reliable": bool(is_full_history),
            "tau_ml": round(tau_ml, 4),
        }
    except Exception as e:
        print(f"  [ML] Error evaluating {wallet_address}: {e}")
        return {
            "raw_score": 0.0,
            "p_ml": 0.0,
            "ml_flag": False,
            "ml_reliable": False,
            "tau_ml": tau_ml,
            "error": str(e),
        }


def trace_funds(initial_victim, max_depth=1, limit=None, chain="ETH"):
    """The main BFS loop that controls fetching, storing, and analyzing.
    
    Supports both Ethereum and Solana chains through the `chain` parameter.
    - ETH: Etherscan ingestion + ML profiling + heuristic BFS
    - SOL: Solana JSON-RPC ingestion + heuristic BFS (ML skipped — model trained on ETH features)
    
    Base58 Solana addresses are case-sensitive and are NEVER lowercased.
    """
    driver = get_db_driver()
    if not driver:
        return {}

    is_sol = chain.upper() == "SOL"
    
    # Resolve effective limit per chain.
    # Public Solana RPC aggressively rate-limits (HTTP 429) at 100 parsed transactions.
    if limit is None:
        limit = 5 if is_sol else 100
    elif is_sol and limit == 100:
        limit = 5

    # Solana base58 is case-sensitive — NEVER call .lower() on it
    root = initial_victim.strip() if is_sol else initial_victim.lower()

    queue = deque([(root, 0)])
    visited = set()

    print(f"[START] Starting Automated Trace for: {initial_victim} (Chain: {chain} | Limit: {limit})")
    ml_results: Dict[str, Dict[str, Any]] = {}
    vasp_set = set(SOLANA_KNOWN_VASPS.keys()) if is_sol else set(v.lower() for v in KNOWN_VASPS)
    # Check if history is truncated (hit limit)
    is_full_history = limit >= 1000

    while queue:
        current_wallet, depth = queue.popleft()

        if depth > max_depth:
            continue

        if current_wallet in visited:
            continue

        visited.add(current_wallet)
        print(f"\n--- Investigating (Depth {depth} | {chain}): {current_wallet} ---")

        # 1. Ingest Data (chain-specific)
        if is_sol:
            # Solana: JSON-RPC -> extract transfers -> Neo4j (Account)-[:TRANSFERRED]->(Account)
            try:
                ingest_solana_wallet(current_wallet, limit=min(limit, 100))
            except Exception as e:
                print(f"  [!] Solana Ingest Error: {e}")
        else:
            # Ethereum: Etherscan -> Neo4j (Wallet)-[:SENT]->(Transaction)-[:TO]->(Wallet)
            tx_data = fetch_transactions(current_wallet, limit=limit)
            if tx_data:
                store_in_neo4j(driver, tx_data)

        # 3. Stage 1 Calibrated ML Behaviour Profiling
        if not is_sol and model:
            eval_res = evaluate_wallet_ml(driver, current_wallet, is_full_history=is_full_history)
            ml_results[current_wallet] = eval_res
            if eval_res["ml_flag"]:
                print(f"  [ML ALERT] {current_wallet} flagged as ILLICIT (p_ml: {eval_res['p_ml']:.2%}, raw: {eval_res['raw_score']:.4f})")
            else:
                print(f"  [ML] {current_wallet} evaluated as legitimate (p_ml: {eval_res['p_ml']:.2%})")

        # 3. Sync Graph for Heuristic Analysis
        G = get_networkx_from_neo4j(driver)

        # 4. Run DSA logic (Check if funds hit a known VASP)
        if check_for_vasp(G, root, chain=chain):
            print(f"\n[SUCCESS] Trace Complete ({chain}). Exchange identified.")
            driver.close()
            return ml_results

        # 5. Heuristic Analysis (Find next suspicious hops — peel chain detection)
        next_targets = detect_next_suspicious_wallets(G, current_wallet, chain=chain)

        for target in next_targets:
            # Solana: case-sensitive comparison; ETH: lowercase comparison
            target_key = target if is_sol else target.lower()
            if target_key not in visited and target_key not in vasp_set:
                print(f"  [+] Suspicious peel-chain hop discovered: {target} -> Queuing (Depth {depth + 1})")
                queue.append((target, depth + 1))

        # Respect API rate limits (Solana public RPC is more aggressive with 429s)
        time.sleep(1.0 if is_sol else 0.5)

    print(f"\n[WARN] Trace finished ({chain}). Max depth reached or trail went cold.")
    driver.close()
    return ml_results


if __name__ == "__main__":
    import sys
    victim_wallet = sys.argv[1] if len(sys.argv) > 1 else "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
    # Auto-detect chain based on address format
    chain_arg = sys.argv[2] if len(sys.argv) > 2 else ("SOL" if not victim_wallet.startswith("0x") and 32 <= len(victim_wallet) <= 44 else "ETH")
    trace_funds(victim_wallet, max_depth=2, limit=5, chain=chain_arg)