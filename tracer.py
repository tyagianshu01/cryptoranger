import time
import os
from collections import deque
from config import KNOWN_VASPS
from dataingestion import fetch_transactions
from db_connect import get_db_driver, store_in_neo4j, get_networkx_from_neo4j
from logic import check_for_vasp, detect_next_suspicious_wallets
from feature_extraction import get_ml_features

# --- ML Model Loading ---
# Pure LightGBM model saved in native text format.
model = None
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'pure_crypto_fraud_model.txt')
try:
    import lightgbm as lgb
    if os.path.exists(MODEL_PATH):
        model = lgb.Booster(model_file=MODEL_PATH)
        print("ML Model (LightGBM Booster) loaded successfully. Inference enabled.")
    else:
        print(f"Notice: '{MODEL_PATH}' not found. Running in heuristic-only mode.")
except ImportError:
    print("Notice: lightgbm not installed. Run 'pip install lightgbm'. Heuristic-only mode.")


def trace_funds(initial_victim, max_depth=1, limit=100):
    """The main loop that controls fetching, storing, and analyzing."""
    driver = get_db_driver()
    if not driver:
        return False

    queue = deque([(initial_victim.lower(), 0)])
    visited = set()

    print(f"[START] Starting Automated Trace for Victim: {initial_victim}")
    ml_flagged_wallets = set()

    while queue:
        current_wallet, depth = queue.popleft()

        if depth > max_depth:
            print(f"[STOP] Reached max depth ({max_depth}) on branch {current_wallet}. Stopping branch.")
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

        # 3. ML Behaviour Profiling (if model is available)
        if model:
            try:
                features_df = get_ml_features(driver, current_wallet)
                fraud_probability = model.predict(features_df)[0]
                # High false-positive bias fix: only flag at 0.9999
                prediction = 1 if fraud_probability >= 0.9999 else 0
                confidence = fraud_probability if prediction == 1 else (1 - fraud_probability)
                if prediction == 1:
                    print(f"  ML ALERT: Wallet flagged as FRAUD (confidence: {confidence:.2%})")
                    ml_flagged_wallets.add(current_wallet.lower())
                else:
                    print(f"  ML Check: Wallet appears legitimate (confidence: {confidence:.2%})")
            except Exception as e:
                print(f"  ML Error during prediction: {e}")

        # 4. Sync Graph for Heuristic Analysis
        G = get_networkx_from_neo4j(driver)

        # 5. Run DSA logic (Check if hit VASP)
        if check_for_vasp(G, initial_victim):
            print("\n[SUCCESS] Trace Complete. Exchange identified.")
            driver.close()
            return list(ml_flagged_wallets)

        # 6. Heuristic Analysis (Find next hops)
        next_targets = detect_next_suspicious_wallets(G, current_wallet)

        for target in next_targets:
            if target not in visited and target not in [v.lower() for v in KNOWN_VASPS]:
                print(f"[START] Starting Auto-Trace for suspicious hop: {target}")
                queue.append((target, depth + 1))

        # Respect API rate limits
        time.sleep(0.5)

    print("\n[WARN] Trace finished. Max depth reached or trail went cold.")
    driver.close()
    return list(ml_flagged_wallets)

if __name__ == "__main__":
    VICTIM_WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
    trace_funds(VICTIM_WALLET, max_depth=1)