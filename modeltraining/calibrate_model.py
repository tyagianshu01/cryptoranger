"""
modeltraining/calibrate_model.py
--------------------------------
Fits isotonic calibration map on an address-level deduplicated held-out split
of transaction_dataset.csv, evaluates precision-recall curve, computes tau_ml
(lowest cutoff achieving precision >= 0.95), and saves ml_calibration.json.
"""

import json
import os
import lightgbm as lgb
import numpy as np
import pandas as pd


def pava(y, w=None):
    """
    Pool Adjacent Violators Algorithm (PAVA) for Isotonic Regression.
    Returns monotonic non-decreasing fitted values y_hat.
    """
    n = len(y)
    if w is None:
        block_weights = [1.0] * n
    else:
        block_weights = [float(val) for val in w]

    y_hat = np.array(y, dtype=float)
    block_indices = [[i] for i in range(n)]

    i = 0
    while i < len(block_indices) - 1:
        val_i = y_hat[block_indices[i][0]]
        val_next = y_hat[block_indices[i + 1][0]]
        if val_i > val_next:
            # Merge blocks i and i+1
            w1 = block_weights[i]
            w2 = block_weights[i + 1]
            new_w = w1 + w2
            new_val = (w1 * val_i + w2 * val_next) / new_w

            for idx in block_indices[i] + block_indices[i + 1]:
                y_hat[idx] = new_val

            block_weights[i] = new_w
            block_indices[i] = block_indices[i] + block_indices[i + 1]
            del block_weights[i + 1]
            del block_indices[i + 1]

            if i > 0:
                i -= 1
        else:
            i += 1

    return y_hat


def calibrate():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dataset_path = os.path.join(base_dir, "modeltraining", "transaction_dataset.csv")
    model_path = os.path.join(base_dir, "pure_crypto_fraud_model.txt")
    output_json = os.path.join(base_dir, "ml_calibration.json")

    print(f"Loading dataset from: {dataset_path}")
    df = pd.read_csv(dataset_path)

    # 1. Address-level deduplication
    initial_count = len(df)
    df = df.drop_duplicates(subset=["Address"]).reset_index(drop=True)
    print(f"Deduplicated addresses: {len(df)} (dropped {initial_count - len(df)} duplicates)")

    # 2. Extract features
    feat_cols = df.columns[4:49]
    X = df[feat_cols].apply(pd.to_numeric, errors="coerce").fillna(0)
    y = df["FLAG"].values.astype(int)

    # 3. Model predictions
    print(f"Loading LightGBM model: {model_path}")
    model = lgb.Booster(model_file=model_path)
    raw_scores = model.predict(X)

    # 4. Stratified Train / Held-out split (75% train, 25% test)
    np.random.seed(42)
    pos_idx = np.where(y == 1)[0]
    neg_idx = np.where(y == 0)[0]
    np.random.shuffle(pos_idx)
    np.random.shuffle(neg_idx)

    train_pos = pos_idx[: int(0.75 * len(pos_idx))]
    test_pos = pos_idx[int(0.75 * len(pos_idx)) :]
    train_neg = neg_idx[: int(0.75 * len(neg_idx))]
    test_neg = neg_idx[int(0.75 * len(neg_idx)) :]

    train_idx = np.concatenate([train_pos, train_neg])
    test_idx = np.concatenate([test_pos, test_neg])

    # 5. Fit Isotonic map on train split
    train_scores = raw_scores[train_idx]
    train_y = y[train_idx]

    sort_order = np.argsort(train_scores)
    sorted_scores = train_scores[sort_order]
    sorted_y = train_y[sort_order]

    fitted_iso = pava(sorted_y)

    # Condense into unique lookup knots
    unique_scores, first_indices = np.unique(sorted_scores, return_index=True)
    unique_calibrated = fitted_iso[first_indices]

    # Ensure endpoints cover [0.0, 1.0]
    knots_x = [0.0] + unique_scores.tolist() + [1.0]
    knots_y = [float(unique_calibrated[0])] + unique_calibrated.tolist() + [float(unique_calibrated[-1])]

    # 6. Evaluate on held-out test split
    test_scores = raw_scores[test_idx]
    test_y = y[test_idx]

    calibrated_test = np.interp(test_scores, knots_x, knots_y)

    # Brier score
    brier = float(np.mean((calibrated_test - test_y) ** 2))

    # Precision-Recall curve
    threshold_candidates = np.linspace(0.01, 0.99, 500)
    best_tau = 0.85
    best_prec = 0.0
    best_rec = 0.0

    prec_list = []
    rec_list = []

    for t in threshold_candidates:
        preds = (calibrated_test >= t).astype(int)
        tp = np.sum((preds == 1) & (test_y == 1))
        fp = np.sum((preds == 1) & (test_y == 0))
        fn = np.sum((preds == 0) & (test_y == 1))
        precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0

        prec_list.append(precision)
        rec_list.append(recall)

        if precision >= 0.95 and best_prec == 0.0:
            best_tau = float(t)
            best_prec = float(precision)
            best_rec = float(recall)

    rec_arr = np.array(rec_list)
    prec_arr = np.array(prec_list)
    sort_pr = np.argsort(rec_arr)
    trap_fn = getattr(np, "trapezoid", getattr(np, "trapz", None))
    pr_auc = float(trap_fn(prec_arr[sort_pr], rec_arr[sort_pr])) if len(rec_arr) > 1 and trap_fn else 0.0

    print(f"\n--- Calibration Results ---")
    print(f"Brier score on test split: {brier:.4f}")
    print(f"PR-AUC on test split:      {pr_auc:.4f}")
    print(f"Chosen tau_ml:             {best_tau:.4f}")
    print(f"Precision at tau_ml:       {best_prec:.4%}")
    print(f"Recall at tau_ml:          {best_rec:.4%}")

    calibration_artifact = {
        "model_version": "v2.1",
        "method": "isotonic_pava",
        "tau_ml": best_tau,
        "brier_score": round(brier, 4),
        "pr_auc": round(pr_auc, 4),
        "precision_at_tau": round(best_prec, 4),
        "recall_at_tau": round(best_rec, 4),
        "knots_x": knots_x,
        "knots_y": knots_y,
    }

    with open(output_json, "w") as f:
        json.dump(calibration_artifact, f, indent=2)

    print(f"Saved calibration parameters to: {output_json}")


if __name__ == "__main__":
    calibrate()
