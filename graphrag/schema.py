"""
graphrag/schema.py
------------------
High-level Design System & Data Contracts for GraphRAG.
Defines strict schemas for query intent, graph contexts, community clusters,
and verifiable forensic citations.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class QueryIntent(str, Enum):
    LOCAL_ENTITY = "local_entity"        # Specific wallet address or tx hash analysis
    GLOBAL_COMMUNITY = "global_community" # Macro-level queries, trends, clusters, laundering patterns
    PATH_FLOW = "path_flow"              # Tracing fund movement from source to destination / off-ramp
    CYPHER_TOOL = "cypher_tool"          # User explicitly asks for raw Cypher query generation
    GENERAL_SUPPORT = "general_support"  # General platform guidance, UI help, definitions


class IntentClassificationResult(BaseModel):
    intent: QueryIntent
    extracted_addresses: List[str] = Field(default_factory=list)
    extracted_tx_hashes: List[str] = Field(default_factory=list)
    search_keywords: List[str] = Field(default_factory=list)
    reasoning: str = ""


class CommunityCluster(BaseModel):
    id: str
    level: int = 0
    size: int = 0
    member_addresses: List[str] = Field(default_factory=list)
    total_volume_eth: float = 0.0
    tx_count: int = 0
    vasp_interactions: List[str] = Field(default_factory=list)
    peel_suspects: List[str] = Field(default_factory=list)
    summary: str = ""
    keywords: List[str] = Field(default_factory=list)


class GraphCitation(BaseModel):
    citation_type: str  # "wallet" | "transaction" | "community" | "vasp"
    identifier: str
    label: Optional[str] = None
    detail: Optional[str] = None


class GraphContext(BaseModel):
    query: str
    intent: QueryIntent
    target_addresses: List[str] = Field(default_factory=list)
    local_subgraph: Dict[str, Any] = Field(default_factory=dict)
    paths: List[Dict[str, Any]] = Field(default_factory=list)
    community_summaries: List[str] = Field(default_factory=list)
    risk_metrics: Dict[str, Any] = Field(default_factory=dict)
    offramp_leads: List[Dict[str, Any]] = Field(default_factory=list)
    citations: List[GraphCitation] = Field(default_factory=list)


class GraphRAGResponse(BaseModel):
    answer: str
    intent: QueryIntent
    citations: List[GraphCitation] = Field(default_factory=list)
    context_summary: str = ""
    communities_referenced: List[str] = Field(default_factory=list)
