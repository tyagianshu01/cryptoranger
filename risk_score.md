# CryptoTracker Sentinel: Risk Scoring & Suspect Identification Engine

Technical documentation of the **revised** risk-scoring, suspect-identification and off-ramp (VASP) execution logic for CryptoTracker Sentinel (v2).

> **Status of this document.** This is a design specification for the corrected engine (v2.1: **ETH-denominated**, matching the Ethereum-only dashboard). Every constant is a **tunable default**, not a validated indicator of fraud. File and function names in section 8 are *proposed*; line numbers from the v1 document no longer apply and must be re-linked after implementation.

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [What Changed from v1 (and Why)](#2-what-changed-from-v1-and-why)
3. [Mathematical Formulation of Risk Scores](#3-mathematical-formulation-of-risk-scores)
   - [Stage 0: Normalisation, Labels and Roles](#stage-0-normalisation-labels-and-roles)
   - [Stage 1: Calibrated ML Evidence](#stage-1-calibrated-ml-evidence-p_ml)
   - [Stage 2: Forward-Only Taint (Haircut Model)](#stage-2-forward-only-taint-haircut-model)
   - [Stage 3: Behavioural Pattern Evidence](#stage-3-behavioural-pattern-evidence-pattern)
   - [Stage 4: Evidence Combination (Noisy-OR) and ML Gate](#stage-4-evidence-combination-noisy-or-and-ml-gate)
   - [Stage 5: Off-Ramp Execution](#stage-5-off-ramp-execution)
4. [Criteria for Identifying Suspect Wallets](#4-criteria-for-identifying-suspect-wallets)
5. [Transaction-Level Risk Scoring & Scoping](#5-transaction-level-risk-scoring--scoping)
6. [Overall Case Risk & Severity Tiers](#6-overall-case-risk--severity-tiers)
7. [Worked Examples](#7-worked-examples)
8. [Configuration Constants](#8-configuration-constants)
9. [Code Reference Map (proposed)](#9-code-reference-map-proposed)
10. [Validation Plan and Known Limitations](#10-validation-plan-and-known-limitations)

---

## 1. Architecture Overview

CryptoTracker Sentinel keeps its **dual-layer forensic pipeline**:
- **Heuristic graph analytics** on a Neo4j tripartite graph `(Wallet)-[:SENT]->(Transaction)-[:TO]->(Wallet)`: taint propagation, behavioural patterns, off-ramp path search.
- **Boosted ML**: a LightGBM model on 48 wallet-level features, now used through a **calibrated probability** instead of a single yes/no cutoff.

```
       [ Etherscan v2 API ] (ETH txlist + ERC20 tokentx)
                │
                ▼
       [ Stage 0: ETH-only scoring scope, dust filter, labels, roles ]
                │
                ▼
       [ Neo4j Tripartite Graph ]
                │
        ┌───────┴──────────────┬───────────────────────┐
        ▼                      ▼                       ▼
 [ Stage 1: ML ]       [ Stage 2: Taint ]      [ Stage 3: Patterns ]
 p_ml (calibrated)     forward-only haircut    peel chain, receive→forward
        │                      │                latency
        └──────────────┬───────┴───────────────────────┘
                       ▼
        [ Stage 4: Noisy-OR combination + ML gate ]
                       │
                       ▼
        [ Stage 5: Off-ramp execution (VASP path, exposure, severity) ]
                       │
                       ▼
 [ Node Scores + Transaction Scores + Off-Ramp Leads + Dossier ]
```

Every wallet node $v$ receives an integer risk score and exactly one **class**:

$$\text{riskScore}(v) \in [0, 99], \qquad \text{class}(v) \in \{\text{suspect},\ \text{intermediate},\ \text{off\_ramp},\ \text{victim}\}$$

---

## 2. What Changed from v1 (and Why)

| # | v1 behaviour | Problem | v2 behaviour |
|---|---|---|---|
| 1 | `ml_base` looked up from a 2×2 table (75/15/45/5), blended `0.6·ml_base + 0.4·structural` | ML-flagged roots could score ~57 and never become suspects; ML confidence beyond the cutoff was ignored | Calibrated probability enters a noisy-OR; ML flag acts as a **gate** (floor of 75) |
| 2 | Taint reached all counterparties, scaled by the receiver's **total** volume | Victims, upstream senders and busy exchanges were tainted; dust poisoning possible | **Forward-only haircut** model: taint = tainted share of the receiver's inflow, per-hop decay |
| 3 | Mixed ETH / token amounts | Meaningless volume, balance and ratio checks | **ETH-only scoring** (native ETH transfers); ERC-20 transfers shown in the ledger but not scored; dust floor in ETH |
| 4 | "Rapid forwarding" = minimum gap between a sender's consecutive outgoing transfers | Fires on batch payouts and bots | **Receive→forward latency**, median over matched flows |
| 5 | Peel rule inspected one wallet, excluded wallets sending ≥10% to a VASP | Single-hop false positives; hid cash-out peels | **Chain-level** peel detection; VASP-terminated chains are *higher* severity |
| 6 | Structural centrality in the score | Ranks busy services as riskiest | Removed from the score (display metric only) |
| 7 | VASPs could be tainted into "suspect" | Off-ramps are the subpoena/freeze targets, not suspects | Dedicated **`off_ramp` class** and Stage 5 execution |
| 8 | Severity by hop count only, edge-count ambiguity | 1-hop dust path rated "critical" | Severity from **hops × ETH exposure × confidence**, hops counted as wallet-to-wallet transfers |
| 9 | Case risk = max over all nodes; cutoffs 75 vs 80; caps 98/99; fallbacks 93/15 | Inconsistent; one over-tainted node made the case critical | Single scale, single cutoffs, off-ramps excluded from case max |
| 10 | `LIMIT 1000` with no ordering | Silent, non-deterministic truncation in forensic output | Ordered query, explicit **truncation flag** |

---

## 3. Mathematical Formulation of Risk Scores

### Stage 0: Scoring Scope, Labels and Roles

**Scoring scope (ETH-only).** All amounts in Stages 2–5 are **native ETH** (`txlist`), converted from wei:
$$\text{amt}_{ETH}(t) = \frac{\text{value}_{wei}(t)}{10^{18}}$$
ERC-20 transfers are still ingested and shown in the ledger, tagged `token (not scored)`. They are **never added to ETH totals**, because different assets and decimals cannot be summed. The ML features (Stage 1) still use ERC-20 statistics, since the model was trained with them. All ratio-based rules (taint share, peel band, forwarding match, path share) are unit-free, so they behave identically in ETH as long as a single asset is used.

**Dust filter.** Transfers with $\text{amt}_{ETH} < \text{DUST\_ETH}$ are excluded from taint, pattern and path calculations (they remain visible in the ledger, tagged `dust`). This blocks dust-poisoning.

**Display-only fiat conversion.** The dossier may show an approximate ₹ / \$ value beside ETH figures at the viewing-time price. This is for readability only and **never enters any score or threshold**.

**Address hygiene.** Addresses are stored lowercase so lookups use the index.

**Labels.** Each wallet is checked against the label set `LABELS` (known VASP hot/deposit wallets, mixers, bridges, routers; sources: curated list and, where available, an attribution API such as Arkham). A wallet has `label_type ∈ {vasp, mixer, bridge, router, none}`.

**Roles.** The case is created with `reported_role`:

| `reported_role` | Meaning | Taint origin set $S$ | Root class |
|---|---|---|---|
| `suspect` (default) | Reported address is believed to be the scam receiver | $S = \{\text{root}\}$ | scored normally |
| `victim` | Reported address is the victim's wallet | $S$ = first-hop recipients of the reported transfer(s) | `victim`, never scored as suspect, never tainted |

A `victim` wallet and any wallet that only *sent* funds toward the origin set are **never** given taint. This is what prevents innocent upstream parties from being flagged.

---

### Stage 1: Calibrated ML Evidence ($p_{ml}$)

The LightGBM model produces a raw score $s(v)$ from the 48 features. It is converted to a calibrated probability:
$$p_{ml}(v) = \text{Iso}\big(s(v)\big)$$
where $\text{Iso}$ is an isotonic (or Platt) calibration map fitted on a **held-out, address-level, de-duplicated** split.

**ML flag.**
$$\text{ml\_flag}(v) \iff p_{ml}(v) \ge \tau_{ml}$$
$\tau_{ml}$ is **chosen from the precision–recall curve** on the held-out set (default rule: the lowest cutoff achieving precision $\ge 0.95$) and recorded with the model version. It replaces the fixed 0.9999.

**Feature reliability.** Features are computed from the wallet's **full available history**. If history was truncated (pagination cap, `LIMIT`, or epoch filter), then:
$$\text{ml\_reliable}(v) = \text{False}$$
and the ML flag is **not used as a gate** for that wallet (its $p_{ml}$ still enters the noisy-OR, and the dossier shows a "partial history" warning). This avoids train/serve skew producing confident but unfounded flags.

---

### Stage 2: Forward-Only Taint (Haircut Model)

Taint $\text{taint}(v) \in [0,1]$ estimates the **fraction of the funds in $v$ that originate from the origin set $S$**, and only flows in the direction money actually moved.

1. Initialise $\text{taint}(s) = 1$ for $s \in S$; all others 0.
2. Process wallets in **BFS layers** from $S$ along **outgoing** transfers only, up to `MAX_HOPS` wallet-to-wallet hops. A node's taint is finalised when first reached; only nodes in strictly earlier layers contribute (this handles cycles).
3. For a wallet $v$ in layer $k \ge 1$:
$$\text{taint}(v) = \min\!\Big(1,\ \gamma \cdot \frac{\sum_{u \to v} \text{taint}(u)\cdot \text{amt}_{ETH}(u \to v)}{\text{inflow}_{ETH}(v)}\Big)$$
   where the sum is over non-dust transfers from earlier layers, $\text{inflow}_{ETH}(v)$ is $v$'s **total** non-dust ETH inflow, and $\gamma = 0.9$ is the per-hop retention factor.
4. **Termination.** Taint **stops** at wallets with `label_type = vasp` (funds have left the on-chain trace) and at mixers/bridges (flagged as `trace_break`, see Stage 5). Their taint value is still computed and reported as *exposure*.

**Properties that fix v1:**
- A busy wallet receiving a tiny tainted amount gets a **tiny** taint (its large inflow dilutes it), regardless of its total volume.
- Senders to the origin, victims, and anyone upstream get **zero** taint.
- Taint decays with distance through $\gamma^{k}$ compounding.

---

### Stage 3: Behavioural Pattern Evidence ($\text{pattern}$)

Two behavioural indicators, each $\in \{0, 1\}$ per wallet, computed only on non-dust transfers and **only for wallets with `label_type = none`** (services legitimately batch, route and forward).

**Peel chain, $\text{peel}(v)$.** A *chain* is a path $w_0 \to w_1 \to \dots \to w_k$ with $k \ge 3$ hops (`PEEL_MIN_HOPS`) such that, for every $w_i$ ($i<k$):
- $\text{main}_i = \text{amt}_{ETH}(w_i \to w_{i+1})$ and $\text{out}_i$ is $w_i$'s total non-dust ETH outflow, with
$$0.70 \le \frac{\text{main}_i}{\text{out}_i} \le 0.995,$$
- $w_i$ has at least **2 distinct receivers** (a real side branch, not repeated sends to one address), and
- consecutive hops occur within `PEEL_WINDOW` (default 72 h).

$\text{peel}(v) = 1$ if $v$ is a member of any qualifying chain. A chain whose last node is an `off_ramp` is tagged **cash-out peel** and escalated in Stage 5. (v1 excluded these; v2 treats them as the most actionable case.)

**Receive→forward latency, $\text{fast}(v)$.** For each non-dust inbound transfer $r$ to $v$ (amount $a_r$, time $t_r$), find the earliest outbound transfers within `FWD_WINDOW` (24 h) whose cumulative amount reaches $\ge 0.9\,a_r$; the latency is the time from $t_r$ to the transfer that reaches that amount: $L_r$.

$$L_{med}(v) = \text{median}_r\ L_r \quad (\text{requires} \ge \text{FWD\_MIN\_FLOWS} = 2 \text{ matched flows})$$
$$\text{fast}(v) = 1 \iff L_{med}(v) < 180\ \text{s}, \qquad \text{very\_fast}(v) \iff L_{med}(v) < 30\ \text{s}$$
With fewer than 2 matched flows the indicator is `not_evaluated`, not 0.

**Pattern evidence.**
$$\text{pattern}(v) = 1 - \big(1 - w_{peel}\cdot \text{peel}(v)\big)\big(1 - w_{fast}\cdot \text{fast}(v)\big), \qquad w_{peel} = w_{fast} = 0.35$$
So $\text{pattern} \in \{0,\ 0.35,\ 0.5775\}$. This replaces the v1 "×1.2 velocity" surcharge.

---

### Stage 4: Evidence Combination (Noisy-OR) and ML Gate

Each signal is treated as an independent *chance the wallet is illicit*. The combined probability is the chance that **at least one** signal is right:

$$P_{illicit}(v) = 1 - \big(1 - p_{ml}(v)\big)\ \big(1 - w_{taint}\cdot \text{taint}(v)\big)\ \big(1 - \text{pattern}(v)\big)\ \big(1 - \text{prior}(v)\big)$$

| Term | Value | Notes |
|---|---|---|
| $w_{taint}$ | 0.9 | Guilt by association is weaker evidence than direct evidence; caps taint-only risk at 90 |
| $\text{prior}(v)$ | $p_{report}=0.30$ if $v$ = reported root with `reported_role=suspect`; else 0 | A victim report is weak, unverified evidence; it is **not** a presumption of guilt |
| $\text{taint}(\text{origin})$ | set to 0 inside this formula | Origin taint is a seed for others; the origin's own risk comes from ML, patterns and the report prior |

**Score:**
$$R(v) = \min\big(99,\ \text{round}(100 \cdot P_{illicit}(v))\big)$$

**ML gate.**
$$\text{if } \text{ml\_flag}(v) \ \land\ \text{ml\_reliable}(v) \ \land\ \text{label\_type}(v)=\text{none}:\quad R(v) \leftarrow \max\big(R(v),\ 75\big)$$
The ML flag now guarantees "suspect", as the v1 documentation always claimed. Labelled services are excluded from the gate: a model false positive on an exchange can never create a suspect.

**Class assignment (in this order):**
1. `reported_role = victim` and $v$ = root → `victim`.
2. `label_type = vasp`, **or** $v$ qualifies as a *probable deposit address* (Stage 5.1) → `off_ramp`.
3. $R(v) \ge 75$ → `suspect` (`flagged = True`).
4. Otherwise → `intermediate` (`flagged = False`).

---

### Stage 5: Off-Ramp Execution

Off-ramps are where on-chain funds meet a regulated entity that can **preserve records or freeze funds**. v2 treats them as first-class investigative leads, not as suspects.

#### 5.1 Detection

A wallet $v$ is an **off-ramp** if either:

- **Confirmed:** `label_type(v) = vasp` (e.g., Binance, WazirX hot wallets in `LABELS`).
- **Probable deposit address:** $v$ is unlabelled but, over the case window, $\ge 90\%$ of its non-dust ETH outflow goes to a **single** labelled VASP wallet, with $\ge 2$ inbound transfers and forwarding within `SWEEP_WINDOW` (24 h). It is recorded as `off_ramp (probable)` with the VASP it sweeps into and the **deposit address itself**, since that is the address a VASP can map to an account holder.

#### 5.2 Path search

Build a **directed** wallet graph from non-dust transfers (a wallet→wallet transfer is one hop; in the tripartite graph it is two edges, and hops are always counted as **wallet-to-wallet transfers**).

For an edge $u \to v$:
$$\text{share}(u \to v) = \frac{\text{amt}_{ETH}(u \to v)}{\text{out}_{ETH}(u)}, \qquad \text{cost}(u \to v) = -\ln\!\big(\text{share}(u \to v)\big) + \lambda, \quad \lambda = 0.1$$

Add a super-sink $T$ with zero-cost edges from every off-ramp. Run **one** Dijkstra from each origin $s \in S$ to $T$, depth-limited to `MAX_HOPS = 5`. The result per off-ramp is the **highest-flow path** (largest product of shares), with ties broken toward fewer hops by $\lambda$.

Path quality: $Q = \prod \text{share}$ along the path. Handle `NoPath` and unknown-node cases explicitly.

#### 5.3 Exposure and confidence

For each off-ramp $o$:
$$\text{tainted\_eth}(o) = \sum_{u \to o} \text{taint}(u)\cdot \text{amt}_{ETH}(u \to o)$$
$$\text{conf}(o) = \max_{u \to o}\ \text{taint}(u)$$
Also recorded: first/last deposit time, number of deposits, hop count $h$ of the best path, $Q$, and whether the path ends a **cash-out peel**.

#### 5.4 Severity and priority

| Severity | Condition (all must hold) |
|---|---|
| **CRITICAL** | $\text{tainted\_eth} \ge 0.5\ \text{ETH}$ **and** $h \le 3$ **and** $\text{conf} \ge 0.5$ |
| **HIGH** | $\text{tainted\_eth} \ge 0.1\ \text{ETH}$ **and** $h \le 5$ **and** $\text{conf} \ge 0.3$ |
| **MEDIUM** | $\text{tainted\_eth} \ge \text{DUST\_ETH}$ |
| **INFO** | otherwise |

A cash-out peel ending at the off-ramp raises the severity by one level (capped at CRITICAL). Off-ramps are ranked by `tainted_eth` then recency of last deposit, because **freeze requests are time-sensitive**.

If no off-ramp is reachable within `MAX_HOPS`, the result is reported as **"no off-ramp found within trace limits"**, never as "no off-ramp exists". If the trace ends at a mixer or bridge, a `trace_break` lead is raised with the last tainted address before it.

#### 5.5 Off-ramp record (output)

```json
{
  "offRamps": [
    {
      "entity": "Binance",
      "tokenTransfersUnscored": 4,
      "address": "0x...",
      "confidence_label": "confirmed",
      "depositAddress": null,
      "hops": 2,
      "path": ["0xroot", "0xA", "0xBinanceHot"],
      "pathFlowShare": 0.78,
      "taintedEth": 3.37,
      "conf": 0.71,
      "firstDeposit": "2026-10-02T09:14:00Z",
      "lastDeposit": "2026-10-04T18:40:00Z",
      "cashOutPeel": true,
      "severity": "CRITICAL",
      "recommendedAction": "Prepare a record-preservation / freeze request for the investigating agency to send to the entity's compliance contact. Include deposit address, timestamps and the evidence path."
    }
  ],
  "offRampStatus": "found"
}
```

The engine produces the **lead and the evidence path**. Whether and how to issue a legal request is a decision for the investigating agency.

---

## 4. Criteria for Identifying Suspect Wallets

```
                                [ Wallet Evaluation ]
                                          │
        ┌──────────────┬──────────────────┼───────────────────┬───────────────┐
        ▼              ▼                  ▼                   ▼               ▼
  [ Role / Label ] [ ML Gate ]       [ Composite R ]   [ Taint ]      [ Patterns ]
  victim / VASP /  p_ml ≥ τ_ml AND     R ≥ 75           via noisy-OR   peel chain,
  deposit address  ml_reliable                                          fast forwarding
        │              │                  │
        ▼              └────────┬─────────┘
   NOT a suspect                ▼
   (victim / off_ramp)   [ FLAGGED AS SUSPECT ]
```

- **Criterion A (ML gate):** $\text{ml\_flag} \land \text{ml\_reliable} \land \text{label\_type}=\text{none}$ ⇒ $R \ge 75$ ⇒ suspect.
- **Criterion B (composite):** $R \ge 75$ ⇒ suspect; otherwise intermediate.
- **Criterion C (taint):** a wallet becomes a suspect through taint only if the noisy-OR reaches 75, which in practice requires high tainted share **plus** at least one more signal (ML or pattern). Taint alone is capped at 90 and cannot reach 75 unless $\text{taint} \ge 0.83$.
- **Criterion D (peel chain):** section 3, Stage 3. Chain-level, $\ge 3$ hops, distinct side branches.
- **Criterion E (rapid forwarding):** section 3, Stage 3. Median receive→forward latency $< 180$ s.
- **Criterion F (off-ramp reachability):** section 3, Stage 5. Produces **leads**, not suspects.
- **Exclusions (never suspect):** `victim`, any `off_ramp`, and any wallet with `label_type ≠ none`.

---

## 5. Transaction-Level Risk Scoring & Scoping

### In-Scope Neighbourhood

All transfers within the 1-hop neighbourhood of the root, with deterministic ordering and an explicit truncation check:

```cypher
MATCH (n:Wallet)-[:SENT|SENT_TOKEN]->(tx)-[:TO|TOKEN_TO]->(m:Wallet)
WHERE (n.address = $wallet_id OR m.address = $wallet_id)      // addresses stored lowercase
      AND ($epoch = 0 OR tx.timestamp.epochSeconds >= $epoch)
RETURN n, tx AS rel, m
ORDER BY tx.timestamp.epochSeconds ASC
LIMIT 1001
```
If 1,001 rows return, the response carries `"truncated": true`, only the first 1,000 are used, and the dossier prints a visible **"results truncated: ledger incomplete"** warning. Aggregates that need full history (Stage 1 features, Stage 3 patterns) are computed by separate unrestricted aggregate queries, not from this limited result.

### Transaction Risk

For a transfer $t: u \to v$ (non-dust):
$$\text{tx\_risk}(t) = \max\Big(\text{round}\big(100\cdot \text{taint}(u)\big),\ \ R(u)\ \text{if class}(u) = \text{suspect else } 0\Big)$$

Rules:
- Transfers **from** a `victim` or from upstream wallets with zero taint score 0, unless the sender is itself a suspect.
- The **reported/disputed** transfer(s) are tagged `evidence = true` and always shown, whatever their score.
- Transfers into an `off_ramp` are tagged `offramp_deposit` with the entity name.
- Dust transfers: `tx_risk` capped at 20 and tagged `dust`.

### Anomaly Coloring

| Condition | Color |
|---|---|
| `offramp_deposit` | Blue accent (`#2563EB`) |
| `tx_risk ≥ 75` | Stark red (`#DC2626`) |
| `50 ≤ tx_risk < 75` | Amber (`#D97706`) |
| otherwise | Neutral gray (`var(--color-text-muted)`) |

---

## 6. Overall Case Risk & Severity Tiers

One scale and one set of cutoffs are used everywhere (node class, transaction colour, case banner):

$$\text{overallRisk} = \max_{v \in V,\ \text{class}(v) \in \{\text{suspect},\ \text{intermediate}\}} R(v)$$

Off-ramps and victims are excluded from the maximum; off-ramp urgency is reported **separately** in `offRamps`. The v1 hard-coded fallbacks (93 / 15) are removed; an empty graph with an ML alert on the root yields the root's computed $R$.

| Range | Severity | Indicator |
|:---:|:---:|:---|
| **75 – 99** | **CRITICAL** | Red |
| **50 – 74** | **ELEVATED** | Amber (`#D97706`) |
| **0 – 49** | **LOW** | Teal / Blue |

The case banner additionally shows the highest off-ramp severity (e.g., "Off-ramp lead: CRITICAL, Binance, 2 hops, ≈ 3.4 ETH tainted").

---

## 7. Worked Examples

Assume $\gamma = 0.9$, $w_{taint} = 0.9$, $w_{peel}=w_{fast}=0.35$, $p_{report} = 0.30$.

| # | Wallet | $p_{ml}$ | taint | pattern | Calculation | $R$ | Result |
|---|---|---|---|---|---|---|---|
| 1 | Root, ML-flagged, one peel match | 0.95 | n/a | 0.35 | $1 - 0.05 \times 0.65 \times 0.70$ | **98** | Suspect (gate satisfied) |
| 2 | Root, not flagged, no patterns | 0.20 | n/a | 0 | $1 - 0.80 \times 0.70$ | **44** | Intermediate, **not presumed guilty** |
| 3 | Counterparty, 60% tainted inflow | 0.05 | 0.60 | 0 | $1 - 0.95 \times 0.46$ | **56** | Intermediate (ELEVATED) |
| 4 | Same, plus peel and fast forwarding | 0.05 | 0.60 | 0.5775 | $1 - 0.95 \times 0.46 \times 0.4225$ | **82** | Suspect |
| 5 | Exchange hot wallet, 9 ETH tainted of 50,000 ETH inflow | n/a | ≈ 0.0001 | n/a | label = vasp | n/a | **`off_ramp`**, never a suspect |
| 6 | Victim's friend who funded the victim | n/a | 0 | n/a | upstream, no forward path from origin | **0** | Not tainted, not flagged |

**Taint propagation example.** Root $R$ sends 10 ETH to $A$ (A's total inflow 12 ETH), $A$ sends 9 ETH to $B$ (B's only inflow), $B$ sends 9 ETH to an exchange with 50,000 ETH inflow:

| Wallet | Calculation | taint |
|---|---|---|
| $A$ | $0.9 \times (1.0 \times 10 / 12)$ | **0.750** |
| $B$ | $0.9 \times (0.750 \times 9 / 9)$ | **0.675** |
| Exchange | $0.9 \times (0.675 \times 9 / 50{,}000)$ | **≈ 0.0001** |

Off-ramp exposure for the exchange: $\text{tainted\_eth} = 0.675 \times 9 = 6.075\ \text{ETH}$, $\text{conf} = 0.675$, $h = 3$ ⇒ **CRITICAL** ($\ge 0.5$ ETH, $h \le 3$, $\text{conf} \ge 0.5$).

---

## 8. Configuration Constants

All values are **defaults to be tuned on labelled cases** and must be loaded from configuration, not hard-coded.

| Constant | Default | Used in |
|---|---|---|
| `DUST_ETH` | 0.002 ETH | Stage 0 filter |
| `γ` (per-hop taint retention) | 0.9 | Stage 2 |
| `MAX_HOPS` | 5 (wallet-to-wallet) | Stages 2, 5 |
| `w_taint` | 0.9 | Stage 4 |
| `p_report` | 0.30 | Stage 4 prior |
| `w_peel`, `w_fast` | 0.35, 0.35 | Stage 3 |
| `SUSPECT_CUTOFF` / `ELEVATED_CUTOFF` | 75 / 50 | Classes, colours, case tiers |
| `τ_ml` | from PR curve (precision ≥ 0.95) | Stage 1 |
| Peel: main-share band, min hops, min receivers, window | 0.70–0.995, 3, 2, 72 h | Stage 3 |
| Forwarding: match ratio, window, min flows, thresholds | 0.9, 24 h, 2, 180 s / 30 s | Stage 3 |
| Probable deposit address: sweep ratio / window | 0.9 / 24 h | Stage 5.1 |
| Path hop penalty `λ` | 0.1 | Stage 5.2 |
| Off-ramp severity thresholds | 0.5 ETH / 0.1 ETH, hops 3 / 5, conf 0.5 / 0.3 | Stage 5.4 |

---

## 9. Code Reference Map (proposed)

| Component | File | Primary function / scope |
|---|---|---|
| Scope, labels, roles | `normalize.py` *(new)* | wei→ETH conversion, ETH-only scope, dust filter, `LABELS` lookup, `reported_role` handling |
| ML inference and calibration | `tracer.py` | Calibrated `p_ml`, `ml_flag`, `ml_reliable`; loads calibrator and `τ_ml` with model version |
| Feature extraction | `feature_extraction.py` | Full-history aggregate query (not the limited neighbourhood query) |
| Taint engine | `scoring/taint.py` *(new)* | Layered forward-only haircut propagation |
| Pattern detectors | `routers/analysis.py` / `scoring/patterns.py` *(new)* | Chain-level peel detection; receive→forward latency |
| Combination and classes | `main.py` | Noisy-OR, ML gate, class assignment, case risk |
| Off-ramp engine | `logic.py` / `scoring/offramp.py` *(new)* | Detection, directed Dijkstra to super-sink, exposure, severity, off-ramp records |
| Forensic endpoints | `routers/analysis.py` | `/vasp-offramps` returns the 5.5 record; `/peeling-heuristics`; `/generate-dossier` |
| Frontend store | `sentinel/src/store/useStore.ts` | New tiers, off-ramp panel, truncation and partial-history warnings |

---

## 10. Validation Plan and Known Limitations

**Before presenting any accuracy claim, measure and record:**
1. Calibration (reliability curve, Brier score) and precision, recall and PR-AUC at $\tau_{ml}$, on an address-level de-duplicated hold-out set.
2. Rule-level false-positive rates for the peel and forwarding detectors on a sample of known-benign wallets, including exchange customers, bots and routers.
3. On any labelled cases available, the share where the true off-ramp appears in the top-3 `offRamps`.
4. Sensitivity of results to $\gamma$, $w_{taint}$, `DUST_ETH` and the 75 cutoff.

**Known limitations (state these openly):**
- All patterns and constants are heuristics; they are leads for investigators, not proof of fraud.
- Off-ramp detection depends on label coverage; per-user deposit addresses of unlabelled services will be missed except via the probable-deposit-address rule.
- Mixers, bridges, cross-chain hops and privacy tools break the trace; the engine reports a `trace_break` and does not guess beyond it.
- **ETH-only scoring:** token (e.g., stablecoin) flows are shown but not scored, so token-based cash-outs will not appear in `tainted_eth`. Off-ramp records report a `tokenTransfersUnscored` count as a prompt for manual review. Native ETH moved through contracts (internal transactions) is missed unless that endpoint is also ingested.
- The haircut model assumes funds mix proportionally inside a wallet; it is an estimate, not a legal tracing rule.
- ETH thresholds drift in fiat meaning as the ETH price moves; keep them in configuration.
- The ML model is only as good as its training data (single public Ethereum dataset); runtime features must match training features.
