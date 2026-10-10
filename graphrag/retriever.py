"""
graphrag/retriever.py
---------------------
Multi-Modal Graph Retrieval Engine for GraphRAG.
Supports Local Entity (1-2 hop neighborhood), Global Community (Macro reports),
Directed Paths to VASPs, and High-Risk/Suspect wallet discovery across the database.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Set, Tuple
from db_connect import get_db_driver
from graphrag.indexer import CommunityIndexer
from graphrag.schema import GraphCitation, GraphContext, QueryIntent
from normalize import get_label_info, get_label_type, normalize_address

logger = logging.getLogger("graphrag.retriever")


class GraphRetriever:
    """
    Retrieves topological and semantic context from Neo4j and the community index.
    Supports both Ethereum and Solana graphs.
    """
    def __init__(self, community_indexer: CommunityIndexer):
        self.community_indexer = community_indexer

    def retrieve_local_subgraph(
        self,
        addresses: List[str],
        driver=None,
        limit: int = 50
    ) -> Tuple[Dict[str, Any], List[GraphCitation]]:
        """
        Retrieves the 1-hop and 2-hop transaction neighborhood for given addresses.
        Supports both Ethereum (tripartite) and Solana (direct transfer) schemas.
        """
        close_driver = False
        if driver is None:
            driver = get_db_driver()
            close_driver = True

        if driver is None or not addresses:
            return {}, []

        normalized_addrs = [normalize_address(a) for a in addresses]
        citations: List[GraphCitation] = []
        seen_citations: Set[str] = set()

        for a in normalized_addrs:
            lbl = get_label_info(a)
            citations.append(GraphCitation(
                citation_type="wallet",
                identifier=a,
                label=lbl.get("name") if lbl.get("type") != "none" else None,
                detail=f"Label Type: {lbl.get('type')}"
            ))
            seen_citations.add(a)

        sol_addrs = [a for a in normalized_addrs if not a.startswith("0x") and 32 <= len(a) <= 44]
        eth_addrs = [a for a in normalized_addrs if a.startswith("0x")]

        transfers = []
        try:
            with driver.session() as session:
                # 1. Query Solana transfers if any solana addresses are present
                if sol_addrs:
                    sol_query = """
                    MATCH (s:Account)-[r:TRANSFERRED]->(m:Account)
                    WHERE s.address IN $addrs OR m.address IN $addrs
                    RETURN s.address AS sender,
                           m.address AS receiver,
                           r.signature AS tx_hash,
                           coalesce(r.amount, 0.0) AS amount,
                           coalesce(r.token, 'SOL') AS symbol,
                           coalesce(r.timestamp, 0) AS timestamp
                    ORDER BY r.timestamp DESC
                    LIMIT $limit
                    """
                    res_sol = session.run(sol_query, addrs=sol_addrs, limit=limit)
                    for record in res_sol:
                        tx_h = record["tx_hash"]
                        sender = record["sender"]
                        receiver = record["receiver"]
                        amount = float(record["amount"] or 0.0)
                        symbol = record["symbol"]
                        transfers.append({
                            "sender": sender,
                            "receiver": receiver,
                            "tx_hash": tx_h,
                            "amount": amount,
                            "symbol": symbol,
                            "timestamp": record["timestamp"]
                        })

                # 2. Query Ethereum transfers if any eth addresses are present
                if eth_addrs or not sol_addrs:
                    query_addrs = eth_addrs if eth_addrs else normalized_addrs
                    query_eth = """
                    MATCH (s:Wallet)-[:SENT|SENT_TOKEN]->(tx)-[:TO|TOKEN_TO]->(r:Wallet)
                    WHERE toLower(s.address) IN $addrs OR toLower(r.address) IN $addrs
                    RETURN toLower(s.address) AS sender,
                           toLower(r.address) AS receiver,
                           tx.hash AS tx_hash,
                           coalesce(tx.value_eth, tx.value_token, 0.0) AS amount,
                           coalesce(tx.token_symbol, 'ETH') AS symbol,
                           coalesce(tx.timestamp.epochSeconds, 0) AS timestamp
                    ORDER BY tx.timestamp.epochSeconds DESC
                    LIMIT $limit
                    """
                    res_eth = session.run(query_eth, addrs=query_addrs, limit=limit)
                    for record in res_eth:
                        tx_h = record["tx_hash"]
                        sender = record["sender"]
                        receiver = record["receiver"]
                        amount = float(record["amount"] or 0.0)
                        symbol = record["symbol"]
                        transfers.append({
                            "sender": sender,
                            "receiver": receiver,
                            "tx_hash": tx_h,
                            "amount": amount,
                            "symbol": symbol,
                            "timestamp": record["timestamp"]
                        })

                for t in transfers:
                    tx_h = t["tx_hash"]
                    sender = t["sender"]
                    receiver = t["receiver"]
                    amount = t["amount"]
                    symbol = t["symbol"]

                    if tx_h and tx_h not in seen_citations:
                        citations.append(GraphCitation(
                            citation_type="transaction",
                            identifier=tx_h,
                            detail=f"{amount:.4f} {symbol} from {sender[:8]}... to {receiver[:8]}..."
                        ))
                        seen_citations.add(tx_h)

                    for endpoint in (sender, receiver):
                        if endpoint not in seen_citations:
                            lbl = get_label_info(endpoint)
                            if lbl.get("type") != "none":
                                citations.append(GraphCitation(
                                    citation_type="vasp" if lbl.get("type") == "vasp" else "wallet",
                                    identifier=endpoint,
                                    label=lbl.get("name"),
                                    detail=lbl.get("type")
                                ))
                                seen_citations.add(endpoint)
        except Exception as e:
            logger.error(f"Error querying local subgraph from Neo4j: {e}")
        finally:
            if close_driver:
                driver.close()

        subgraph_data = {
            "queried_addresses": normalized_addrs,
            "transfers_count": len(transfers),
            "transfers": transfers[:40]
        }
        return subgraph_data, citations

    def retrieve_paths_to_vasps(
        self,
        source_address: str,
        driver=None,
        max_depth: int = 4
    ) -> Tuple[List[Dict[str, Any]], List[GraphCitation]]:
        """
        Searches for directed fund flows terminating at known exchanges or service providers.
        Supports both Ethereum and Solana.
        """
        close_driver = False
        if driver is None:
            driver = get_db_driver()
            close_driver = True

        if driver is None:
            return [], []

        src = normalize_address(source_address)
        is_sol = not src.startswith("0x") and 32 <= len(src) <= 44

        if is_sol:
            query = f"""
            MATCH p = (src:Account)-[r:TRANSFERRED*1..{max_depth}]->(dst:Account)
            WHERE src.address = $src
            RETURN [node in nodes(p) | node.address] AS path_addrs,
                   length(p) AS hops
            LIMIT 5
            """
        else:
            query = f"""
            MATCH p = (src:Wallet)-[:SENT*1..{max_depth}]->(dst:Wallet)
            WHERE toLower(src.address) = $src
            RETURN [node in nodes(p) | toLower(node.address)] AS path_addrs,
                   length(p) AS hops
            LIMIT 5
            """

        paths: List[Dict[str, Any]] = []
        citations: List[GraphCitation] = []

        try:
            with driver.session() as session:
                res = session.run(query, src=src)
                for record in res:
                    addrs = record["path_addrs"]
                    dest = addrs[-1] if addrs else ""
                    dest_label = get_label_info(dest)

                    paths.append({
                        "hops": record["hops"],
                        "path": addrs,
                        "destination_label": dest_label.get("name") if dest_label.get("type") != "none" else "Unlabeled Wallet"
                    })

                    if dest_label.get("type") == "vasp":
                        citations.append(GraphCitation(
                            citation_type="vasp",
                            identifier=dest,
                            label=dest_label.get("name"),
                            detail="Path Destination VASP Off-ramp"
                        ))
        except Exception as e:
            logger.error(f"Error executing path search in Neo4j: {e}")

        finally:
            if close_driver:
                driver.close()

        return paths, citations

    def retrieve_macro_suspects_and_flows(
        self,
        matched_communities,
        driver=None
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[GraphCitation]]:
        """
        Gathers suspect wallets and high-value transactions across the Neo4j graph.
        """
        close_driver = False
        if driver is None:
            driver = get_db_driver()
            close_driver = True

        suspect_wallets: List[Dict[str, Any]] = []
        top_transfers: List[Dict[str, Any]] = []
        citations: List[GraphCitation] = []
        seen = set()

        # 1. Collect peel suspects from matched communities
        for c in matched_communities:
            for suspect_addr in c.peel_suspects:
                if suspect_addr not in seen:
                    lbl = get_label_info(suspect_addr)
                    suspect_wallets.append({
                        "address": suspect_addr,
                        "community_id": c.id,
                        "label": lbl.get("name"),
                        "label_type": lbl.get("type"),
                        "indicator": "Peel chain candidate / pass-through hop with fanout <= 3"
                    })
                    citations.append(GraphCitation(
                        citation_type="wallet",
                        identifier=suspect_addr,
                        label=f"Suspect ({c.id})",
                        detail=f"Community {c.id} peel candidate"
                    ))
                    seen.add(suspect_addr)

        # 2. Query top transactions from Neo4j
        if driver:
            query = """
            MATCH (s:Wallet)-[:SENT|SENT_TOKEN]->(tx)-[:TO|TOKEN_TO]->(r:Wallet)
            WHERE coalesce(tx.value_eth, tx.value_token, 0.0) > 0.001
            RETURN toLower(s.address) AS sender,
                   toLower(r.address) AS receiver,
                   tx.hash AS tx_hash,
                   coalesce(tx.value_eth, tx.value_token, 0.0) AS amount,
                   coalesce(tx.token_symbol, 'ETH') AS symbol
            ORDER BY coalesce(tx.value_eth, tx.value_token, 0.0) DESC
            LIMIT 10
            """
            try:
                with driver.session() as session:
                    res = session.run(query)
                    for r in res:
                        tx_h = r["tx_hash"]
                        sender = r["sender"]
                        receiver = r["receiver"]
                        amt = float(r["amount"] or 0.0)
                        sym = r["symbol"]

                        top_transfers.append({
                            "sender": sender,
                            "receiver": receiver,
                            "amount": amt,
                            "symbol": sym,
                            "tx_hash": tx_h
                        })

                        if tx_h and tx_h not in seen:
                            citations.append(GraphCitation(
                                citation_type="transaction",
                                identifier=tx_h,
                                detail=f"High-volume transfer: {amt:.4f} {sym}"
                            ))
                            seen.add(tx_h)
            except Exception as e:
                logger.error(f"Error retrieving top transfers from Neo4j: {e}")
            finally:
                if close_driver:
                    driver.close()

        return suspect_wallets[:10], top_transfers[:8], citations

    def assemble_context(
        self,
        query: str,
        intent: QueryIntent,
        target_addresses: List[str],
        driver=None
    ) -> GraphContext:
        """
        Builds the unified GraphContext combining local, global, and path dimensions.
        """
        all_citations: List[GraphCitation] = []
        local_subgraph = {}
        paths = []
        community_summaries: List[str] = []
        risk_metrics: Dict[str, Any] = {}

        # 1. Local entity retrieval if addresses present
        if target_addresses:
            local_subgraph, local_citations = self.retrieve_local_subgraph(
                target_addresses, driver=driver, limit=40
            )
            all_citations.extend(local_citations)

            if len(target_addresses) > 0:
                p_data, path_citations = self.retrieve_paths_to_vasps(
                    target_addresses[0], driver=driver
                )
                paths = p_data
                all_citations.extend(path_citations)

        # 2. Global community retrieval
        matched_communities = self.community_indexer.search_communities(query, top_k=4)
        for c in matched_communities:
            community_summaries.append(c.summary)
            all_citations.append(GraphCitation(
                citation_type="community",
                identifier=c.id,
                label=f"Cluster ({c.size} wallets, {c.total_volume_eth:.2f} ETH)",
                detail=", ".join(c.vasp_interactions) or "Internal"
            ))

        # 3. Macro suspect discovery if inquiring generally about risks/wallets
        if not target_addresses:
            suspects, top_txs, macro_cits = self.retrieve_macro_suspects_and_flows(
                matched_communities, driver=driver
            )
            risk_metrics["suspect_wallets"] = suspects
            risk_metrics["top_transfers"] = top_txs
            all_citations.extend(macro_cits)

        # Deduplicate citations by identifier
        dedup_citations = []
        seen_ids = set()
        for cit in all_citations:
            if cit.identifier not in seen_ids:
                dedup_citations.append(cit)
                seen_ids.add(cit.identifier)

        return GraphContext(
            query=query,
            intent=intent,
            target_addresses=target_addresses,
            local_subgraph=local_subgraph,
            paths=paths,
            community_summaries=community_summaries,
            risk_metrics=risk_metrics,
            offramp_leads=[],
            citations=dedup_citations
        )
