"""
graphrag/service.py
-------------------
High-Level GraphRAG Orchestration Facade.
Provides an unified, production-grade interface for community detection,
hybrid indexing, intelligent query routing, and evidence-grounded forensic generation.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional
from db_connect import get_db_driver
from graphrag.community import detect_communities, persist_communities_to_neo4j
from graphrag.indexer import CommunityIndexer
from graphrag.retriever import GraphRetriever
from graphrag.router import GraphRouter
from graphrag.schema import CommunityCluster, GraphRAGResponse, QueryIntent
from graphrag.synthesizer import GraphSynthesizer

logger = logging.getLogger("graphrag.service")


class GraphRAGService:
    """
    Unified high-level facade for GraphRAG operations.
    Thread-safe and designed to integrate cleanly without perturbing existing endpoints.
    """
    _instance: Optional[GraphRAGService] = None

    def __init__(self):
        self.community_indexer = CommunityIndexer()
        self.retriever = GraphRetriever(self.community_indexer)
        self.router = GraphRouter()
        self.synthesizer = GraphSynthesizer()
        self._is_initialized = False

    @classmethod
    def get_instance(cls) -> GraphRAGService:
        if cls._instance is None:
            cls._instance = GraphRAGService()
        return cls._instance

    async def initialize_index(self):
        """
        Runs initial clustering and indexing against the active Neo4j database.
        Safe to call during application startup or in a background task.
        """
        try:
            logger.info("Initializing GraphRAG communities from Neo4j...")
            driver = get_db_driver()
            if not driver:
                logger.warning("Neo4j driver unavailable; postponing GraphRAG indexing.")
                return

            clusters = detect_communities(driver=driver)
            if clusters:
                persist_communities_to_neo4j(clusters, driver=driver)
                await self.community_indexer.index_clusters(clusters)
                self._is_initialized = True
                logger.info(f"GraphRAG initialized successfully with {len(clusters)} clusters.")
            else:
                logger.info("No transaction data found in Neo4j for GraphRAG clustering.")

            driver.close()
        except Exception as e:
            logger.error(f"Error during GraphRAG initialization: {e}")

    async def query(
        self,
        prompt: str,
        chat_history: Optional[List[dict]] = None
    ) -> GraphRAGResponse:
        """
        Main query entrypoint: routes intent, retrieves local/global/path context,
        and generates grounded forensic narrative with citations.
        """
        # Ensure at least minimal index exists
        if not self._is_initialized and not self.community_indexer.clusters:
            # Quick non-blocking trigger or light scan
            driver = get_db_driver()
            if driver:
                clusters = detect_communities(driver=driver)
                if clusters:
                    for c in clusters:
                        c.summary = self.community_indexer.generate_rule_summary(c)
                    await self.community_indexer.index_clusters(clusters)
                    self._is_initialized = True
                driver.close()

        # 1. Classify Intent
        classification = self.router.classify_intent(prompt)
        logger.info(f"GraphRAG Query Intent: {classification.intent} | Entities: {classification.extracted_addresses}")

        # 2. Assemble Multi-Modal Context
        context = self.retriever.assemble_context(
            query=prompt,
            intent=classification.intent,
            target_addresses=classification.extracted_addresses
        )

        # 3. Grounded Synthesis
        response = await self.synthesizer.generate_response(context, chat_history=chat_history)
        return response

    def get_all_communities(self) -> List[CommunityCluster]:
        return list(self.community_indexer.clusters.values())

    async def reindex(self) -> Dict[str, Any]:
        driver = get_db_driver()
        if not driver:
            return {"status": "error", "message": "Neo4j connection failed"}

        clusters = detect_communities(driver=driver)
        persist_communities_to_neo4j(clusters, driver=driver)
        await self.community_indexer.index_clusters(clusters)
        self._is_initialized = True
        driver.close()

        return {
            "status": "success",
            "clusters_count": len(clusters),
            "clusters": [
                {
                    "id": c.id,
                    "size": c.size,
                    "volume_eth": c.total_volume_eth,
                    "tx_count": c.tx_count,
                    "vasps": c.vasp_interactions,
                    "summary": c.summary
                }
                for c in clusters
            ]
        }
