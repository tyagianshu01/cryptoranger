"""
graphrag
--------
Graph Retrieval-Augmented Generation (GraphRAG) package for CryptoTracker Sentinel.
Combines Neo4j topological traversals, modularity community clustering,
and LLM synthesis with verifiable on-chain evidence citations.
"""

from graphrag.schema import (
    QueryIntent,
    IntentClassificationResult,
    CommunityCluster,
    GraphCitation,
    GraphContext,
    GraphRAGResponse,
)
from graphrag.community import detect_communities, persist_communities_to_neo4j
from graphrag.indexer import CommunityIndexer, HybridVectorIndex
from graphrag.retriever import GraphRetriever
from graphrag.router import GraphRouter
from graphrag.synthesizer import GraphSynthesizer
from graphrag.service import GraphRAGService

__all__ = [
    "QueryIntent",
    "IntentClassificationResult",
    "CommunityCluster",
    "GraphCitation",
    "GraphContext",
    "GraphRAGResponse",
    "detect_communities",
    "persist_communities_to_neo4j",
    "CommunityIndexer",
    "HybridVectorIndex",
    "GraphRetriever",
    "GraphRouter",
    "GraphSynthesizer",
    "GraphRAGService",
]
