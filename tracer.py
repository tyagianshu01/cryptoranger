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

from config import KNOWN_VASPS
from dataingestion import fetch_transactions
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

        preds = model.predict(features_df)
        raw_score = float(preds[0])

        # Stage 1: Isotonic calibration map
        calibrated_prob = float(np.interp(raw_score, knots_x, knots_y))
        is_flagged = calibrated_prob >= tau_ml

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


def trace_funds(initial_victim: str, max_depth: int = 1, limit: int = 100):
    """The main loop that controls fetching, storing, and analyzing."""
    driver = get_db_driver()
    if not driver:
        return {}

    queue = deque([(initial_victim.lower().strip(), 0)])
    visited = set()

    print(f"[START] Starting Automated Trace for: {initial_victim}")
    ml_results: Dict[str, Dict[str, Any]] = {}

    # Check if history is truncated (hit limit)
    is_full_history = limit >= 1000

    while queue:
        current_wallet, depth = queue.popleft()

        if depth > max_depth:
            continue

        if current_wallet in visited:
            continue

        visited.add(current_wallet)
        print(f"\n--- Investigating (Depth {depth}): {current_wallet} ---")

        # 1. Ingest Data (Hit Etherscan)
        tx_data = fetch_transactions(current_wallet, limit=limit)

        # 2. Store in Neo4j
        if tx_data:
            store_in_neo4j(driver, tx_data)

        # 3. Stage 1 Calibrated ML Behaviour Profiling
        if model:
            eval_res = evaluate_wallet_ml(driver, current_wallet, is_full_history=is_full_history)
            ml_results[current_wallet] = eval_res
            if eval_res["ml_flag"]:
                print(f"  [ML ALERT] {current_wallet} flagged as ILLICIT (p_ml: {eval_res['p_ml']:.2%}, raw: {eval_res['raw_score']:.4f})")
            else:
                print(f"  [ML] {current_wallet} evaluated as legitimate (p_ml: {eval_res['p_ml']:.2%})")

        # 4. Sync Graph for Heuristic Analysis
        G = get_networkx_from_neo4j(driver)

        # 5. Run DSA logic (Check if hit VASP)
        if check_for_vasp(G, initial_victim):
            print("\n[SUCCESS] Trace Complete. Exchange identified.")
            driver.close()
            return ml_results

        # 6. Heuristic Analysis (Find next hops)
        next_targets = detect_next_suspicious_wallets(G, current_wallet)
        for target in next_targets:
            target_lower = target.lower().strip()
            if target_lower not in visited and target_lower not in [v.lower() for v in KNOWN_VASPS]:
                print(f"[START] Starting Auto-Trace for suspicious hop: {target_lower}")
                queue.append((target_lower, depth + 1))

        time.sleep(0.5)

    print("\n[WARN] Trace finished. Max depth reached or trail went cold.")
    driver.close()
    return ml_results


if __name__ == "__main__":
    VICTIM_WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
    trace_funds(VICTIM_WALLET, max_depth=1)