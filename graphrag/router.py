"""
graphrag/router.py
------------------
Query Intent Classification and Investigative Router for GraphRAG.
Analyzes user inputs to extract entities (Ethereum addresses, Tx hashes)
and determine the optimal retrieval mode (Local, Global, Path, Cypher, or General).
"""

from __future__ import annotations

import re
from typing import List
from graphrag.schema import IntentClassificationResult, QueryIntent

_ETH_ADDR_RE = re.compile(r"0x[a-fA-F0-9]{40}")
_ETH_TX_RE = re.compile(r"0x[a-fA-F0-9]{64}")
_SOL_ADDR_RE = re.compile(r"\b[1-9A-HJ-NP-Za-km-z]{32,44}\b")


class GraphRouter:
    """
    Routes investigative inquiries to the optimal retrieval modality.
    Tolerates common investigative typos (e.g., 'walletes', 'hogh', 'suspekts').
    Supports both Ethereum and Solana addresses.
    """

    @staticmethod
    def classify_intent(query: str) -> IntentClassificationResult:
        q_lower = query.lower()

        eth_addrs = _ETH_ADDR_RE.findall(query)
        sol_addrs = [a for a in _SOL_ADDR_RE.findall(query) if len(a) >= 32 and not a.startswith("0x")]
        extracted_addrs = list(set(eth_addrs + sol_addrs))
        extracted_txs = list(set(_ETH_TX_RE.findall(query)))


        # 1. Explicit Cypher generation request
        if any(term in q_lower for term in ["cypher", "write query", "neo4j query", "match (", "return p"]):
            return IntentClassificationResult(
                intent=QueryIntent.CYPHER_TOOL,
                extracted_addresses=extracted_addrs,
                extracted_tx_hashes=extracted_txs,
                reasoning="Query asks explicitly for Cypher query generation."
            )

        # 2. Directed flow or pathfinding request
        path_keywords = [
            "path", "flow", "where did the funds go", "route", "destination",
            "reach", "offramp", "cash out", "hops", "tracing", "trace"
        ]
        if any(k in q_lower for k in path_keywords) and (extracted_addrs or extracted_txs or "stolen" in q_lower or "victim" in q_lower):
            return IntentClassificationResult(
                intent=QueryIntent.PATH_FLOW,
                extracted_addresses=extracted_addrs,
                extracted_tx_hashes=extracted_txs,
                reasoning="Investigator is inquiring about multi-hop fund flows or path to cash-out."
            )

        # 3. Entity-specific analysis (when specific address or tx hash is provided)
        if extracted_addrs or extracted_txs:
            return IntentClassificationResult(
                intent=QueryIntent.LOCAL_ENTITY,
                extracted_addresses=extracted_addrs,
                extracted_tx_hashes=extracted_txs,
                reasoning=f"Detected specific on-chain entities: {len(extracted_addrs)} wallets, {len(extracted_txs)} txs."
            )

        # 4. Macro-level community, risk, suspect, or data exploration
        # Handles spelling variations and typos: 'hogh', 'walletes', 'risks', 'suspect'
        investigative_keywords = [
            "community", "communities", "cluster", "clusters", "macro", "overview",
            "peel chain", "peel", "peeling", "mixer", "tornado", "laundering", "patterns",
            "database", "stats", "exchanges", "summary",
            # Risk & Suspect queries:
            "risk", "risks", "high risk", "hogh", "critical", "elevated", "threat",
            "suspect", "suspects", "suspicious", "illicit", "fraud", "scam", "flagged",
            "dirty", "taint", "tainted", "drainer", "hack", "stolen", "victim", "victims",
            "wallet", "wallets", "walletes", "address", "addresses", "who", "which",
            "show", "list", "find", "top"
        ]

        # If user asks about risks, suspects, wallets, or patterns:
        matched_kw = [k for k in investigative_keywords if k in q_lower]
        if matched_kw:
            # Check if this is an investigative data question
            is_investigative = (
                any(r in q_lower for r in ["risk", "risks", "hogh", "suspect", "illicit", "fraud", "scam", "flag", "peel", "dirty", "stolen", "cluster", "communit", "database"]) or
                ("wallet" in q_lower or "walletes" in q_lower or "address" in q_lower) and any(w in q_lower for w in ["who", "which", "what", "top", "list", "show", "find", "have", "are"])
            )
            if is_investigative:
                return IntentClassificationResult(
                    intent=QueryIntent.GLOBAL_COMMUNITY,
                    extracted_addresses=[],
                    extracted_tx_hashes=[],
                    search_keywords=matched_kw,
                    reasoning="Investigator asks about risk profiles, suspects, clusters, or laundering topologies in the database."
                )

        # 5. Default: General platform guidance (only if purely asking about UI/how-to)
        return IntentClassificationResult(
            intent=QueryIntent.GENERAL_SUPPORT,
            extracted_addresses=[],
            extracted_tx_hashes=[],
            reasoning="Platform navigation, user guidance, or general forensics capability question."
        )
