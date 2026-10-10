"""
graphrag/community.py
---------------------
Topological Community Detection and Graph Clustering for GraphRAG.
Partitions the on-chain Neo4j transaction graph into coherent behavioral communities
using modularity clustering (NetworkX Louvain) and stores the community structure in Neo4j.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional
import networkx as nx
from networkx.algorithms import community as nx_comm

from db_connect import get_db_driver
from graphrag.schema import CommunityCluster
from normalize import get_label_info, get_label_type

logger = logging.getLogger("graphrag.community")


def extract_nx_graph_from_neo4j(driver=None) -> nx.DiGraph:
    """
    Queries Neo4j for all wallet-to-wallet transactions and builds a NetworkX DiGraph.
    """
    close_driver = False
    if driver is None:
        driver = get_db_driver()
        close_driver = True

    if driver is None:
        logger.error("Could not obtain Neo4j driver connection.")
        return nx.DiGraph()

    G = nx.DiGraph()

    query = """
    MATCH (s:Wallet)-[:SENT|SENT_TOKEN]->(tx)-[:TO|TOKEN_TO]->(r:Wallet)
    RETURN toLower(s.address) AS sender,
           toLower(r.address) AS receiver,
           tx.hash AS tx_hash,
           coalesce(tx.value_eth, tx.value_token, 0.0) AS amount,
           coalesce(tx.token_symbol, 'ETH') AS symbol,
           coalesce(tx.timestamp.epochSeconds, 0) AS timestamp
    LIMIT 10000
    """

    try:
        with driver.session() as session:
            result = session.run(query)
            for record in result:
                u = record["sender"]
                v = record["receiver"]
                amt = float(record["amount"] or 0.0)
                tx_hash = record["tx_hash"]
                symbol = record["symbol"]
                ts = record["timestamp"]

                if not G.has_node(u):
                    lbl = get_label_info(u)
                    G.add_node(u, label=lbl.get("name", "Wallet"), label_type=lbl.get("type", "none"))
                if not G.has_node(v):
                    lbl = get_label_info(v)
                    G.add_node(v, label=lbl.get("name", "Wallet"), label_type=lbl.get("type", "none"))

                G.add_edge(u, v, weight=amt, tx_hash=tx_hash, symbol=symbol, timestamp=ts)
    except Exception as e:
        logger.error(f"Error querying Neo4j for graph extraction: {e}")
    finally:
        if close_driver:
            driver.close()

    return G


def detect_communities(G: Optional[nx.DiGraph] = None, driver=None) -> List[CommunityCluster]:
    """
    Executes Louvain community detection on the undirected projection of the transaction graph.
    Returns a list of structured CommunityCluster objects.
    """
    if G is None:
        G = extract_nx_graph_from_neo4j(driver=driver)

    if len(G) == 0:
        return []

    # Project to undirected graph with summed weights for modularity partitioning
    U = G.to_undirected()

    try:
        raw_communities = nx_comm.louvain_communities(U, weight="weight", seed=42)
    except Exception as e:
        logger.warning(f"Louvain partitioning fallback to connected components: {e}")
        raw_communities = list(nx.connected_components(U))

    clusters: List[CommunityCluster] = []
    # Sort communities by size descending
    raw_communities = sorted(raw_communities, key=lambda c: len(c), reverse=True)

    for idx, member_set in enumerate(raw_communities):
        members = list(member_set)
        if len(members) == 0:
            continue

        comm_id = f"community_{idx + 1}"
        sub = G.subgraph(members)

        total_vol = 0.0
        tx_count = sub.number_of_edges()
        vasp_set = set()
        peel_candidates = set()

        for u, v, data in sub.edges(data=True):
            amt = float(data.get("weight", 0.0))
            total_vol += amt

        for node in members:
            ltype = get_label_type(node)
            if ltype in {"vasp", "mixer", "bridge"}:
                vasp_set.add(get_label_info(node)["name"])

            # Low degree with high out/in ratio is a peel candidate
            out_deg = sub.out_degree(node)
            if 1 <= out_deg <= 3:
                peel_candidates.add(node)

        cluster = CommunityCluster(
            id=comm_id,
            level=1,
            size=len(members),
            member_addresses=members,
            total_volume_eth=round(total_vol, 4),
            tx_count=tx_count,
            vasp_interactions=sorted(list(vasp_set)),
            peel_suspects=sorted(list(peel_candidates))[:5],
            summary="",
            keywords=[]
        )
        clusters.append(cluster)

    return clusters


def persist_communities_to_neo4j(clusters: List[CommunityCluster], driver=None) -> int:
    """
    Saves Community nodes and creates (Wallet)-[:BELONGS_TO]->(Community) relationships in Neo4j.
    """
    close_driver = False
    if driver is None:
        driver = get_db_driver()
        close_driver = True

    if driver is None:
        return 0

    count_saved = 0
    cypher_save = """
    UNWIND $batch AS c
    MERGE (comm:Community {id: c.id})
    SET comm.size = c.size,
        comm.total_volume_eth = c.total_volume_eth,
        comm.tx_count = c.tx_count,
        comm.summary = c.summary,
        comm.vasps = c.vasp_interactions,
        comm.updated_at = datetime()
    WITH comm, c
    UNWIND c.member_addresses AS addr
    MATCH (w:Wallet {address: addr})
    MERGE (w)-[:BELONGS_TO]->(comm)
    """

    batch = [
        {
            "id": c.id,
            "size": c.size,
            "total_volume_eth": c.total_volume_eth,
            "tx_count": c.tx_count,
            "summary": c.summary,
            "vasp_interactions": c.vasp_interactions,
            "member_addresses": c.member_addresses,
        }
        for c in clusters
    ]

    try:
        with driver.session() as session:
            session.run(cypher_save, batch=batch)
            count_saved = len(clusters)
            logger.info(f"Successfully saved {count_saved} communities to Neo4j.")
    except Exception as e:
        logger.error(f"Error persisting communities to Neo4j: {e}")
    finally:
        if close_driver:
            driver.close()

    return count_saved
