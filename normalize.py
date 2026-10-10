"""
normalize.py
------------
Stage 0: Normalisation, Labels, Roles, and Configuration Constants.
Implements Section 3 (Stage 0) and Section 8 of risk_score.md.
"""

from typing import Literal, Dict, Any, Set, List

# ─────────────────────────────────────────────────────────────────────────────
# Configuration Constants (Section 8 — Tunable Defaults)
# ─────────────────────────────────────────────────────────────────────────────

DUST_ETH: float = 0.002
GAMMA: float = 0.9                    # Per-hop taint retention factor
MAX_HOPS: int = 5                     # Max wallet-to-wallet hops
W_TAINT: float = 0.9                  # Weight on taint in noisy-OR
P_REPORT: float = 0.30                # Prior for reported suspect root
W_PEEL: float = 0.35                  # Pattern weight for peel chain
W_FAST: float = 0.35                  # Pattern weight for rapid forwarding
SUSPECT_CUTOFF: int = 75              # Class / severity cutoff for suspect
ELEVATED_CUTOFF: int = 50             # Severity cutoff for elevated risk

# Peel chain configuration
PEEL_MIN_HOPS: int = 3
PEEL_MAIN_MIN: float = 0.70
PEEL_MAIN_MAX: float = 0.995
PEEL_MIN_RECEIVERS: int = 2
PEEL_WINDOW_SECONDS: int = 72 * 3600  # 72 hours

# Receive -> forward latency configuration
FWD_WINDOW_SECONDS: int = 24 * 3600   # 24 hours
FWD_MIN_FLOWS: int = 2
FWD_MATCH_RATIO: float = 0.9
FAST_FWD_SECONDS: float = 180.0
VERY_FAST_FWD_SECONDS: float = 30.0

# Probable deposit address configuration
PROBABLE_DEPOSIT_SWEEP_RATIO: float = 0.90
PROBABLE_DEPOSIT_SWEEP_WINDOW: int = 24 * 3600  # 24 hours

# Path search configuration
LAMBDA_HOP_PENALTY: float = 0.1

# Off-ramp severity thresholds
OFFRAMP_CRITICAL_ETH: float = 0.5
OFFRAMP_CRITICAL_HOPS: int = 3
OFFRAMP_CRITICAL_CONF: float = 0.5

OFFRAMP_HIGH_ETH: float = 0.1
OFFRAMP_HIGH_HOPS: int = 5
OFFRAMP_HIGH_CONF: float = 0.3


# ─────────────────────────────────────────────────────────────────────────────
# Labels & Attribution Database
# ─────────────────────────────────────────────────────────────────────────────

LabelType = Literal["vasp", "mixer", "bridge", "router", "none"]

LABELS: Dict[str, Dict[str, Any]] = {
    # Major Exchanges / VASPs
    "0x28c6c06298d514db089934071355e5743bf21d60": {"name": "Binance: Hot Wallet 6", "type": "vasp"},
    "0x21a31ee1afc51d94c2efccaa2092ad1028285549": {"name": "Binance: Hot Wallet 14", "type": "vasp"},
    "0xdfd5293d8e347dff59e457140071305e9745cde": {"name": "Binance: Hot Wallet 16", "type": "vasp"},
    "0x56eddb7aa87536c09ccc2793473599fd21a8b17f": {"name": "WazirX: Cold Wallet", "type": "vasp"},
    "0xa910f92acdaf488fa6ef02174fb862085729b236": {"name": "Coinbase: Hot Wallet", "type": "vasp"},
    "0x503828976d22510aad0201ac7ec88293211d23dc": {"name": "Coinbase: 2", "type": "vasp"},
    "0x2910543af39aba0cd09dbb2d50200b3e800a63d2": {"name": "Kraken: Hot Wallet", "type": "vasp"},
    "0x0d0707963952f2fba59dd06f2b425ace40b492fe": {"name": "Gate.io: 1", "type": "vasp"},
    "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b": {"name": "OKX: Hot Wallet", "type": "vasp"},

    # Mixers & Privacy protocols
    "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b": {"name": "Tornado.Cash: Router", "type": "mixer"},
    "0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936": {"name": "Tornado.Cash: 0.1 ETH", "type": "mixer"},
    "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf": {"name": "Tornado.Cash: 1 ETH", "type": "mixer"},
    "0xa160cdab225685da1d56aa342ad8841c3b53f291": {"name": "Tornado.Cash: 10 ETH", "type": "mixer"},
    "0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3": {"name": "Tornado.Cash: 100 ETH", "type": "mixer"},

    # Bridges
    "0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf": {"name": "Polygon (Matic): Bridge", "type": "bridge"},
    "0xa0c68c638235ee32657e8f720a23cec1bfc77c77": {"name": "Arbitrum: Bridge", "type": "bridge"},
    "0x99c9fc46f92e8a1c0dec1b1747d010903e559bcc": {"name": "Optimism: Gateway", "type": "bridge"},

    # Routers / DEXs
    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": {"name": "Uniswap V2: Router", "type": "router"},
    "0xe592427a0aece92de3edee1f18e0157c05861564": {"name": "Uniswap V3: Router", "type": "router"},
    "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": {"name": "Uniswap: Universal Router", "type": "router"},
}


def wei_to_eth(value_wei: int | float) -> float:
    """Converts wei to native ETH."""
    if not value_wei:
        return 0.0
    return float(value_wei) / 1e18


def is_dust(amt_eth: float) -> bool:
    """Checks whether an ETH amount is below the dust filter cutoff."""
    return amt_eth < DUST_ETH


def get_label_info(address: str) -> Dict[str, Any]:
    """Returns label information for an address."""
    addr_lower = address.lower().strip()
    return LABELS.get(addr_lower, {"name": f"Wallet-{addr_lower[:6]}", "type": "none"})


def get_label_type(address: str) -> LabelType:
    """Returns the label type category."""
    return get_label_info(address).get("type", "none")


def get_origin_set(
    root_address: str,
    reported_role: str = "suspect",
    outbound_transfers_from_root: List[Dict[str, Any]] | None = None,
) -> Set[str]:
    """
    Computes the initial taint origin set S based on the reported role.
    If reported_role == 'victim': S is the set of first-hop recipients.
    If reported_role == 'suspect': S is {root_address}.
    """
    root_lower = root_address.lower().strip()
    if reported_role.lower() == "victim":
        if outbound_transfers_from_root:
            recipients = {
                t["target"].lower().strip()
                for t in outbound_transfers_from_root
                if not is_dust(t.get("amount", 0.0))
            }
            if recipients:
                return recipients
        return set()
    return {root_lower}
