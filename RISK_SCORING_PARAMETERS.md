# CryptoTracker Sentinel — Risk Scoring Methodology & Parameter Reference

Comprehensive reference guide for the multi-stage risk scoring architecture, mathematical formulations, algorithmic parameters, and classification rules implemented in **CryptoTracker Sentinel (v2.1)**.

---

## 1. Executive Summary & Pipeline Overview

CryptoTracker Sentinel employs a **dual-validation forensic architecture** combining:
1. **Calibrated Machine Learning (Stage 1):** A gradient-boosted decision tree (LightGBM) trained on 45 temporal, behavioral, and volume features, calibrated via Isotonic PAVA regression to output a statistically valid probability $p_{ml}(v) \in [0, 1]$.
2. **Deterministic Heuristic Graph Analytics (Stages 0, 2, 3, 5):** Neo4j tripartite graph traversals computing forward-only haircut taint propagation, algorithmic peel chain detection, rapid pass-through velocity penalties, and regulated VASP off-ramp identification.
3. **Noisy-OR Bayesian Evidence Combination & ML Gate (Stage 4):** A probabilistic combination formula fusing independent evidence channels with an empirical decision gate ensuring high-confidence ML flags guarantee suspect classification.

```
       [ Ingested Blockchain Transactions (Etherscan v2 API) ]
                                   │
                                   ▼
       [ Stage 0: ETH-Only Normalization, Dust Floor & Role Assignment ]
                                   │
                                   ▼
                     [ Neo4j Tripartite Graph ]
        (Wallet)-[:SENT]->(Transaction)-[:TO]->(Wallet)
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        ▼                          ▼                          ▼
 [ Stage 1: ML ]            [ Stage 2: Taint ]       [ Stage 3: Patterns ]
 • 45 Cypher Features       • Forward-Only Haircut   • Peel Chain (70–99.5%)
 • LightGBM Booster         • Dynamic Inflow Dilution• Receive→Forward Latency
 • Isotonic Map p_ml(v)     • Seed Confidence Scaling• w_peel & w_fast Weights
        │                          │                          │
        └──────────────────────────┼──────────────────────────┘
                                   ▼
        [ Stage 4: Bayesian Noisy-OR Fusion + Hard ML Gate ]
          P_illicit = 1 - (1-p_ml)(1-w_taint·taint)(1-pattern)(1-prior)
          ML Gate: if p_ml >= tau_ml -> Risk >= 75
                                   │
                                   ▼
        [ Stage 5: Regulated Off-Ramp Discovery & Severity ]
          Identify VASP hot wallets, sweeps, and subpoena targets
                                   │
                                   ▼
        [ Final Output: Risk Score (0-99), Class, Ledger Colors, Dossier ]
```

---

## 2. Parameter Master Reference Table

All tunable defaults and forensic thresholds defined in [`normalize.py`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py), [`tracer.py`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/tracer.py), and [`ml_calibration.json`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/ml_calibration.json):

| Parameter | Value | Location | Description & Forensic Rationale |
| :--- | :--- | :--- | :--- |
| `DUST_ETH` | `0.002 ETH` | [`normalize.py:14`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L14) | Dust cutoff threshold. Excludes dust-poisoning attacks and automated spam transfers from taint and pattern math. |
| `GAMMA` | `0.90` | [`normalize.py:15`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L15) | Per-hop taint retention factor ($\gamma$). Represents 10% decay per wallet-to-wallet transfer to account for mixer/dispersion dissipation. |
| `MAX_HOPS` | `5` | [`normalize.py:16`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L16) | Maximum wallet-to-wallet traversal depth for BFS taint propagation and pathfinding. |
| `W_TAINT` | `0.90` | [`normalize.py:17`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L17) | Weight on taint evidence in Noisy-OR combination ($w_{taint}$). Caps pure guilt-by-association risk at 90. |
| `P_REPORT` | `0.30` | [`normalize.py:18`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L18) | Prior probability ($p_{report}$) assigned to an unverified suspect root wallet upon initial user report. |
| `W_PEEL` | `0.35` | [`normalize.py:19`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L19) | Weight assigned to detected peel chain membership in the behavioral pattern model ($w_{peel}$). |
| `W_FAST` | `0.35` | [`normalize.py:20`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L20) | Weight assigned to rapid receive-to-forward behavior in the behavioral pattern model ($w_{fast}$). |
| `SUSPECT_CUTOFF` | `75` | [`normalize.py:21`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L21) | Minimum risk score threshold required to flag a wallet as a `suspect` (`flagged = True`). |
| `ELEVATED_CUTOFF`| `50` | [`normalize.py:22`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L22) | Minimum score threshold for elevated investigative interest (intermediate watch status). |
| `PEEL_MIN_HOPS` | `3` | [`normalize.py:25`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L25) | Minimum consecutive transfers required to qualify as an algorithmic peel chain. |
| `PEEL_MAIN_MIN` | `0.70` (70%) | [`normalize.py:26`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L26) | Minimum outbound volume share transferred along the main trunk hop of a peel chain. |
| `PEEL_MAIN_MAX` | `0.995` (99.5%) | [`normalize.py:27`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L27) | Maximum outbound volume share on main trunk (prevents single bulk transfers from false flagging). |
| `PEEL_MIN_RECEIVERS`| `2` | [`normalize.py:28`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L28) | Minimum distinct counterparties required at each peel hop (1 main trunk + $\ge 1$ peel split). |
| `PEEL_WINDOW_SECONDS`| `259,200s` (72h) | [`normalize.py:29`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L29) | Maximum time elapsed between consecutive hops in a qualified peel chain. |
| `FWD_WINDOW_SECONDS` | `86,400s` (24h) | [`normalize.py:32`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L32) | Time horizon inspected for matching incoming funds to subsequent outbound forwarding. |
| `FWD_MIN_FLOWS` | `2` | [`normalize.py:33`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L33) | Minimum matched flow pairs required before computing receive-to-forward latency. |
| `FWD_MATCH_RATIO` | `0.90` (90%) | [`normalize.py:34`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L34) | Minimum percentage of inbound transfer amount that must be matched in outbound transfers. |
| `FAST_FWD_SECONDS` | `180.0s` (3m) | [`normalize.py:35`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L35) | Median latency threshold for rapid forwarding detection (`fast = 1`). |
| `VERY_FAST_FWD_SECONDS`| `30.0s` | [`normalize.py:36`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L36) | Automated bot / transit tumbler threshold (`very_fast = 1`). |
| `PROBABLE_DEPOSIT_SWEEP_RATIO` | `0.90` (90%) | [`normalize.py:39`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L39) | Outflow percentage directed to a single VASP required to flag an unlabelled wallet as a probable deposit address. |
| `PROBABLE_DEPOSIT_SWEEP_WINDOW`| `86,400s` (24h) | [`normalize.py:40`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L40) | Maximum time window allowed for deposit sweeping to a known exchange. |
| `LAMBDA_HOP_PENALTY` | `0.10` | [`normalize.py:43`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/normalize.py#L43) | Distance penalty applied per hop in off-ramp confidence evaluation: $e^{-\lambda \cdot hops}$. |
| `tau_ml` ($\tau_{ml}$) | `0.1769` | [`tracer.py:25`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/tracer.py#L25) | Calibrated decision threshold from Isotonic PAVA precision-recall curve achieving precision $\ge 0.95$. |

---

## 3. Mathematical Formulations by Stage

### Stage 0: Scoring Scope & Dust Filtering
- **Asset Scope:** All volume and graph heuristics operate strictly on **native ETH** converted from wei:
  $$\text{amt}_{ETH}(t) = \frac{\text{value}_{wei}(t)}{10^{18}}$$
- **Dust Filter:** Any transfer with $\text{amt}_{ETH}(t) < \text{DUST\_ETH}$ is excluded from taint, pattern, and path computations.
- **Role Assignment:**
  - `reported_role = "suspect"`: Origin set $S = \{\text{root}\}$. Scored normally.
  - `reported_role = "victim"`: Origin set $S = \text{Outbound recipients of victim}$. Root classified as `victim`, risk score permanently locked to `0`, and barred from taint propagation.

---

### Stage 1: Machine Learning Profiling ($p_{ml}$)
- **Feature Extraction:** 45 aggregated wallet-level Cypher features extracted via [`feature_extraction.py`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/feature_extraction.py) (e.g., transaction frequencies, time gaps, contract creation counts, unique counterparties, ERC-20 token distributions).
- **Booster Inference:** Evaluated with LightGBM Booster (`pure_crypto_fraud_model.txt`) producing raw score $s(v) \in [0, 1]$.
- **Isotonic Calibration:** Converted into a calibrated empirical probability using piecewise linear interpolation over 5,619 knots from [`ml_calibration.json`](file:///c:/Users/priya/OneDrive/Desktop/crypto/cryptoranger/ml_calibration.json):
  $$p_{ml}(v) = \text{Interp}(s(v), \text{knots\_x}, \text{knots\_y})$$
- **Reliability Flag:**
  $$\text{ml\_flag}(v) \iff p_{ml}(v) \ge \tau_{ml} \quad (\tau_{ml} = 0.1769)$$
  $$\text{ml\_reliable}(v) = \text{True} \iff \text{wallet history was not truncated}$$

---

### Stage 2: Forward-Only Haircut Taint Model
Taint $\text{taint}(v) \in [0, 1]$ represents the fraction of funds in wallet $v$ originating from origin set $S$.
1. **Initialization:**
   $$\text{taint}(s) = 1.0 \quad \forall s \in S, \quad \text{all others } = 0.0$$
2. **Layered BFS Propagation (Outgoing edges only, up to `MAX_HOPS = 5`):**
   For wallet $v$ reached at layer $k \ge 1$:
   $$\text{taint}(v) = \min\left(1.0, \ \gamma \cdot \frac{\sum_{u \to v} \text{taint}(u) \cdot \text{amt}_{ETH}(u \to v)}{\text{inflow}_{ETH}(v)}\right)$$
   Where:
   - $\gamma = 0.90$ (retention decay per hop).
   - $\text{inflow}_{ETH}(v)$ is wallet $v$'s **total non-dust ETH inflow**, ensuring high-volume exchange hot wallets dilute taint appropriately.
3. **Termination:** Taint propagation halts upon encountering regulated entities (`label_type = "vasp"`).

---

### Stage 3: Behavioral Pattern Evidence ($\text{pattern}$)
Combines two independent topological fraud patterns:
1. **Peel Chain ($\text{peel}(v) \in \{0, 1\}$):**
   - Consecutive path length $k \ge 3$.
   - Outbound volume ratio: $0.70 \le \frac{\text{main\_amt}}{\text{total\_out}} \le 0.995$.
   - Branching factor: $\ge 2$ distinct receivers per hop.
   - Hop latency $\le 72\text{ hours}$.
2. **Receive-to-Forward Latency ($\text{fast}(v) \in \{0, 1\}$):**
   - Forwarding matched flow ratio $\ge 0.90$ within 24 hours.
   - Evaluated over median latency $L_{med}(v)$ with $\ge 2$ flows:
     $$\text{fast}(v) = 1 \iff L_{med}(v) < 180\text{ seconds}$$
3. **Combined Pattern Score:**
   $$\text{pattern}(v) = 1 - (1 - w_{peel} \cdot \text{peel}(v))(1 - w_{fast} \cdot \text{fast}(v))$$
   With $w_{peel} = w_{fast} = 0.35$:
   - No patterns: $\text{pattern}(v) = 0.0$
   - Single pattern: $\text{pattern}(v) = 0.35$
   - Both patterns: $\text{pattern}(v) = 1 - (0.65 \times 0.65) = 0.5775$

---

### Stage 4: Bayesian Evidence Combination (Noisy-OR) & ML Gate
Each evidence channel represents an independent probability that the wallet is illicit:
$$P_{illicit}(v) = 1 - (1 - p_{ml}(v)) \cdot (1 - w_{taint} \cdot \text{taint}(v)) \cdot (1 - \text{pattern}(v)) \cdot (1 - \text{prior}(v))$$

Where:
- $w_{taint} = 0.90$
- $\text{prior}(v) = P_{REPORT} = 0.30$ if $v = \text{root}$ and $\text{reported\_role} = \text{"suspect"}$, else $0.0$.
- $\text{taint}(\text{origin})$ is set to $0.0$ inside its own formula (origin risk derives from direct ML, patterns, and report prior; it acts as a seed for others).

**Base Integer Risk Score:**
$$R(v) = \min\left(99, \ \text{round}(100 \cdot P_{illicit}(v))\right)$$

**Hard ML Gate:**
$$\text{If } \text{ml\_flag}(v) \land \text{ml\_reliable}(v) \land \text{label\_type}(v) = \text{"none"}: \quad R(v) \leftarrow \max(R(v), \ 75)$$

---

## 4. Node Classification Hierarchy

Wallets are strictly categorized into mutually exclusive classes in the following evaluation order:

```
                      [ Evaluate Wallet v ]
                               │
               Is reported_role == "victim" & v == root?
                              / \
                        Yes  /   \ No
                            ▼     ▼
                        [ victim ] Is label_type == "vasp" OR probable deposit?
                                  / \
                            Yes  /   \ No
                                ▼     ▼
                            [ off_ramp ] Is R(v) >= 75?
                                        / \
                                  Yes  /   \ No
                                      ▼     ▼
                                  [ suspect ] [ intermediate ]
```

1. **`victim`:** Target of the crime. Risk score = 0, never flagged.
2. **`off_ramp`:** Regulated exchange or crypto-to-fiat exit point. Never classified as a suspect regardless of incoming volume. Subpoena target.
3. **`suspect`:** High-threat node with $R(v) \ge 75$ or gated by reliable ML. Flagged for surveillance (`flagged = True`).
4. **`intermediate`:** Unregulated intermediary, mule account, or routing wallet with $R(v) < 75$ (`flagged = False`).

---

## 5. Transaction-Level Counterparty Risk & UI Coloring

In the forensic transaction ledger, every individual transfer is scored to reflect **counterparty threat** rather than repeating the investigated wallet's own risk score:

| Transfer Direction | Sender (`src`) | Receiver (`tgt`) | Assigned `tx_risk` | Evidentiary Purpose |
| :--- | :--- | :--- | :---: | :--- |
| **Outbound** | Root Wallet | Counterparty $M$ | $R(M)$ | Measures the danger of where funds were transferred. |
| **Inbound** | Counterparty $N$ | Root Wallet | $R(N)$ | Measures the illicit taint of the funding source. |
| **Intermediary** | Counterparty $N$ | Counterparty $M$ | $\max(R(N), R(M))$ | Evaluates hop-to-hop risk across peel chains. |

**Ledger Anomaly Highlighting:**
$$\text{riskColor} = \begin{cases}
\text{"#DC2626"} \text{ (Crimson Red)}, & \text{if } \text{tx\_risk} \ge 75 \\
\text{"var(--color-text-muted)"} \text{ (Slate Gray)}, & \text{if } \text{tx\_risk} < 75
\end{cases}$$

---

## 6. Case Severity Tiers & Off-Ramp Leads

Case-level severity is determined by the maximum risk score across eligible non-exchange nodes:
$$\text{Case Risk} = \max_{v \in \{\text{suspect, intermediate}\}} R(v)$$

- **`CRITICAL`:** $\text{Case Risk} \ge 75$
- **`ELEVATED`:** $50 \le \text{Case Risk} < 75$
- **`LOW`:** $\text{Case Risk} < 50$

**Off-Ramp Lead Severity:**
Regulated endpoints receive forensic prioritization based on hop distance and total exposed tainted volume:
$$\text{Confidence} = \text{taint}(u) \cdot \frac{\text{amt}_{ETH}(u \to \text{VASP})}{\text{inflow}_{ETH}(\text{VASP})} \cdot e^{-0.10 \cdot hops}$$
- **`CRITICAL`:** Tainted ETH $\ge 0.5\text{ ETH}$, Hops $\le 3$, Confidence $\ge 0.50$ (or terminates a cash-out peel chain).
- **`HIGH`:** Tainted ETH $\ge 0.1\text{ ETH}$, Hops $\le 5$, Confidence $\ge 0.30$.
- **`MEDIUM` / `LOW`:** Residual or deep-hop transfers.
