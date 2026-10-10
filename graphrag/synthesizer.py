"""
graphrag/synthesizer.py
-----------------------
Grounded Forensic Generation and Evidence Citation Engine for GraphRAG.
Constructs prompt contexts from retrieved Neo4j facts and calls OpenRouter LLM
with strict anti-hallucination constraints and verifiable on-chain citations.
"""

from __future__ import annotations

import logging
import os
from typing import List, Optional
import httpx

from graphrag.schema import GraphCitation, GraphContext, GraphRAGResponse, QueryIntent

logger = logging.getLogger("graphrag.synthesizer")

GRAPHRAG_SYSTEM_PROMPT = """You are 'ChainTrace Intelligence Synthesizer', an elite cyber forensics AI built for blockchain financial intelligence and money laundering investigations.

MISSION:
Answer the investigator's question with surgical precision using the ON-CHAIN GRAPH CONTEXT provided below.

STRICT FORENSIC CITATION RULES:
1. ONLY make claims supported by the provided Graph Context (transfers, community reports, and paths).
2. DO NOT invent transaction hashes or wallet addresses. Cite ONLY the addresses and hashes provided in the context.
3. When referencing a transfer, cite the specific amount, currency, and transaction hash when available.
4. If funds terminate at a known VASP (exchange) deposit address, highlight the entity name (e.g. Binance, Kraken, OKX) and state the recommended subpoena lead.
5. If the queried wallet has no records in the current database, state clearly: "No on-chain activity or transaction history is recorded in the local database for this address. Trigger a Trace Search in the Graph Explorer to ingest live Etherscan telemetry."
6. Maintain an objective, authoritative, and analytical tone. Use bullet points for readability.
"""


class GraphSynthesizer:
    """
    Synthesizes retrieved graph facts into forensic reports.
    """

    @staticmethod
    def _format_context_as_markdown(context: GraphContext) -> str:
        blocks: List[str] = []

        # 1. Target Entities
        if context.target_addresses:
            blocks.append(f"### Target Wallets Analyzed:\n" + "\n".join(f"- `{a}`" for a in context.target_addresses))

        # 2. Local Subgraph Transfers
        sub = context.local_subgraph
        transfers = sub.get("transfers", [])
        if transfers:
            blocks.append(f"### On-Chain Transactions ({len(transfers)} records retrieved):")
            tx_lines = []
            for t in transfers[:25]:
                tx_lines.append(
                    f"- **{t['amount']:.4f} {t['symbol']}** | From: `{t['sender']}` -> To: `{t['receiver']}` | Tx: `{t['tx_hash']}`"
                )
            blocks.append("\n".join(tx_lines))
        elif context.target_addresses:
            blocks.append("### On-Chain Transactions: None found in current local database.")

        # 3. Directed Paths to Exchanges
        if context.paths:
            blocks.append("### Multi-Hop Fund Flow Paths Identified:")
            path_lines = []
            for p in context.paths:
                chain_str = " -> ".join(f"`{a[:8]}...`" for a in p["path"])
                path_lines.append(f"- **{p['hops']} Hops**: {chain_str} (Terminus: **{p['destination_label']}**)")
            blocks.append("\n".join(path_lines))

        # 4. Community Summaries
        if context.community_summaries:
            blocks.append("### Associated Cluster Intelligence:")
            for s in context.community_summaries:
                blocks.append(f"- {s}")

        # 5. Suspect Wallets Identified (Macro context)
        suspects = context.risk_metrics.get("suspect_wallets", [])
        if suspects:
            lines = [
                f"- `{s['address']}` ({s.get('indicator', 'Suspect')}) [Cluster: {s.get('community_id')}]"
                for s in suspects
            ]
            blocks.append("### High-Risk / Peel Chain Suspect Wallets Identified in Database:\n" + "\n".join(lines))

        # 6. High-Value Transfers
        top_txs = context.risk_metrics.get("top_transfers", [])
        if top_txs:
            lines = [
                f"- **{t['amount']:.4f} {t['symbol']}** | From: `{t['sender']}` -> To: `{t['receiver']}` | Tx: `{t['tx_hash']}`"
                for t in top_txs
            ]
            blocks.append("### Notable High-Value On-Chain Transactions in Database:\n" + "\n".join(lines))

        return "\n\n".join(blocks)

    async def generate_response(
        self,
        context: GraphContext,
        chat_history: Optional[List[dict]] = None
    ) -> GraphRAGResponse:
        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            return GraphRAGResponse(
                answer="Error: OPENROUTER_API_KEY is not configured in the environment.",
                intent=context.intent,
                citations=context.citations,
                context_summary="Missing API key"
            )

        context_md = self._format_context_as_markdown(context)

        messages = [
            {"role": "system", "content": GRAPHRAG_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"INVESTIGATOR INQUIRY: {context.query}\n\n"
                    f"--- RETRIEVED ON-CHAIN GRAPH CONTEXT ---\n"
                    f"{context_md}\n"
                    f"-----------------------------------------\n"
                    f"Please provide a rigorous forensic response citing the specific transactions and entities above."
                )
            }
        ]

        if chat_history:
            # Prepend last 3 conversation turns before current prompt for context continuity
            history_subset = chat_history[-3:]
            cleaned_history = [
                {"role": m.get("role", "user"), "content": m.get("content", "")}
                for m in history_subset
                if m.get("content")
            ]
            messages = [messages[0]] + cleaned_history + [messages[1]]

        answer_text = ""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model": "openai/gpt-4o-mini",
                        "messages": messages,
                        "temperature": 0.2,
                        "max_tokens": 700
                    }
                )
                if res.is_success:
                    answer_text = res.json()["choices"][0]["message"]["content"].strip()
                else:
                    answer_text = f"AI Provider returned status {res.status_code}: {res.text}"
        except Exception as e:
            logger.error(f"Error calling LLM for GraphRAG synthesis: {e}")
            answer_text = f"Telemetry synthesis connection error: {str(e)}"

        return GraphRAGResponse(
            answer=answer_text,
            intent=context.intent,
            citations=context.citations,
            context_summary=f"Retrieved {len(context.citations)} citations across {len(context.community_summaries)} communities.",
            communities_referenced=[c.identifier for c in context.citations if c.citation_type == "community"]
        )
