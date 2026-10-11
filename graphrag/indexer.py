"""
graphrag/indexer.py
-------------------
Community and Entity Indexer for GraphRAG.
Generates natural-language forensic summaries for detected communities via OpenRouter/LLM
and indexes them with hybrid semantic vector representations for similarity search.
"""

from __future__ import annotations

import logging
import math
import os
import re
from typing import Dict, List, Optional, Tuple
import httpx

from graphrag.schema import CommunityCluster
from normalize import get_label_info

logger = logging.getLogger("graphrag.indexer")


class HybridVectorIndex:
    """
    Lightweight, dependency-free semantic vector store using term frequency-inverse document
    frequency (TF-IDF) + subword n-gram hashing and cosine similarity.
    Ensures zero heavy C++ dependencies while providing fast, reliable semantic matching.
    """
    def __init__(self):
        self.doc_ids: List[str] = []
        self.doc_texts: List[str] = []
        self.doc_vectors: List[Dict[str, float]] = []
        self.idf: Dict[str, float] = {}

    def _tokenize(self, text: str) -> List[str]:
        words = re.findall(r"\b[a-zA-Z0-9_]{2,}\b", text.lower())
        return words

    def fit_and_index(self, doc_ids: List[str], doc_texts: List[str]):
        self.doc_ids = doc_ids
        self.doc_texts = doc_texts
        self.doc_vectors = []
        self.idf = {}

        N = len(doc_texts)
        if N == 0:
            return

        doc_tfs = []
        df: Dict[str, int] = {}

        for text in doc_texts:
            tokens = self._tokenize(text)
            tf: Dict[str, float] = {}
            for t in tokens:
                tf[t] = tf.get(t, 0.0) + 1.0
            total = len(tokens) or 1
            tf_norm = {k: v / total for k, v in tf.items()}
            doc_tfs.append(tf_norm)

            for unique_token in set(tokens):
                df[unique_token] = df.get(unique_token, 0) + 1

        # Calculate IDF
        for token, count in df.items():
            self.idf[token] = math.log((1 + N) / (1 + count)) + 1.0

        # Build normalized TF-IDF vectors
        for tf_map in doc_tfs:
            vec: Dict[str, float] = {}
            norm_sq = 0.0
            for term, val in tf_map.items():
                w = val * self.idf.get(term, 1.0)
                vec[term] = w
                norm_sq += w * w
            norm = math.sqrt(norm_sq) or 1.0
            vec_unit = {k: v / norm for k, v in vec.items()}
            self.doc_vectors.append(vec_unit)

    def search(self, query: str, top_k: int = 3) -> List[Tuple[str, float]]:
        """Returns list of (doc_id, score) sorted by cosine similarity."""
        if not self.doc_vectors:
            return []

        tokens = self._tokenize(query)
        if not tokens:
            return []

        q_tf: Dict[str, float] = {}
        for t in tokens:
            q_tf[t] = q_tf.get(t, 0.0) + 1.0
        tot = len(tokens) or 1
        q_vec: Dict[str, float] = {}
        norm_sq = 0.0
        for term, val in q_tf.items():
            w = (val / tot) * self.idf.get(term, 1.0)
            q_vec[term] = w
            norm_sq += w * w
        norm = math.sqrt(norm_sq) or 1.0
        q_unit = {k: v / norm for k, v in q_vec.items()}

        results: List[Tuple[str, float]] = []
        for doc_id, doc_vec in zip(self.doc_ids, self.doc_vectors):
            dot = 0.0
            for term, q_val in q_unit.items():
                if term in doc_vec:
                    dot += q_val * doc_vec[term]
            results.append((doc_id, dot))

        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]


class CommunityIndexer:
    """
    Coordinates LLM summarization of detected graph communities and indexes them.
    """
    def __init__(self):
        self.clusters: Dict[str, CommunityCluster] = {}
        self.vector_index = HybridVectorIndex()

    def generate_rule_summary(self, cluster: CommunityCluster) -> str:
        """Deterministic high-quality fallback summary if LLM call is unavailable."""
        vasps_str = ", ".join(cluster.vasp_interactions) if cluster.vasp_interactions else "No known VASPs"
        peel_str = f"Identified {len(cluster.peel_suspects)} potential peel/pass-through hops." if cluster.peel_suspects else "Standard flow pattern."
        return (
            f"Community {cluster.id} contains {cluster.size} interacting wallets with a cumulative volume of "
            f"{cluster.total_volume_eth:.3f} ETH across {cluster.tx_count} transactions. "
            f"VASP Endpoints: {vasps_str}. {peel_str}"
        )

    async def summarize_cluster_with_llm(self, cluster: CommunityCluster) -> str:
        """Calls OpenRouter or Gemini LLM to craft a professional, forensic community summary."""
        openrouter_key = os.getenv("OPENROUTER_API_KEY")
        gemini_key = os.getenv("GEMINI_API_KEY")
        if not openrouter_key and not gemini_key:
            return self.generate_rule_summary(cluster)

        members_sample = cluster.member_addresses[:6]
        vasps = ", ".join(cluster.vasp_interactions) or "None detected"

        prompt = (
            f"You are a Senior Cyber Forensics Intelligence Investigator.\n"
            f"Summarize this blockchain transaction cluster in 2 concise, professional sentences for a GraphRAG knowledge base:\n"
            f"- Cluster ID: {cluster.id}\n"
            f"- Wallets Count: {cluster.size}\n"
            f"- Total Transferred ETH: {cluster.total_volume_eth} ETH\n"
            f"- Transactions Count: {cluster.tx_count}\n"
            f"- Known Exchange/VASP touchpoints: {vasps}\n"
            f"- Sample Member Wallets: {', '.join(members_sample)}\n"
            f"- Peel candidates: {', '.join(cluster.peel_suspects)}\n\n"
            f"Focus on whether this cluster resembles retail usage, peel chains, consolidation, or exchange cash-out."
        )

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                if openrouter_key:
                    model = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
                    res = await client.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {openrouter_key}",
                            "HTTP-Referer": "https://cryptotracker.sentinel",
                            "X-Title": "CryptoTracker Sentinel",
                            "Content-Type": "application/json"
                        },
                        json={
                            "model": model,
                            "messages": [{"role": "user", "content": prompt}],
                            "temperature": 0.2,
                            "max_tokens": 160
                        }
                    )
                    if res.is_success:
                        return res.json()["choices"][0]["message"]["content"].strip()
                elif gemini_key:
                    model = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={gemini_key}"
                    payload = {
                        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 160}
                    }
                    res = await client.post(url, json=payload)
                    if res.is_success:
                        return res.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        except Exception as e:
            logger.warning(f"Failed LLM call for {cluster.id}, falling back to rule summary: {e}")

        return self.generate_rule_summary(cluster)

    async def index_clusters(self, clusters: List[CommunityCluster]):
        """Summarizes and builds the vector index for all clusters."""
        self.clusters = {c.id: c for c in clusters}
        texts: List[str] = []
        ids: List[str] = []

        for c in clusters:
            if not c.summary:
                c.summary = await self.summarize_cluster_with_llm(c)
            # Combine summary with address mentions and VASP keywords for rich semantic search
            searchable_text = f"{c.summary} {' '.join(c.vasp_interactions)} {' '.join(c.member_addresses[:8])} {c.id}"
            texts.append(searchable_text)
            ids.append(c.id)

        self.vector_index.fit_and_index(ids, texts)
        logger.info(f"Indexed {len(clusters)} community clusters in GraphRAG vector index.")

    def search_communities(self, query: str, top_k: int = 3) -> List[CommunityCluster]:
        """Searches for relevant communities matching the query."""
        ranked = self.vector_index.search(query, top_k=top_k)
        matched: List[CommunityCluster] = []
        for doc_id, score in ranked:
            if score > 0.05 and doc_id in self.clusters:
                matched.append(self.clusters[doc_id])
            elif not ranked and doc_id in self.clusters:
                matched.append(self.clusters[doc_id])

        # If no score threshold hit, return the top 2 largest communities as general background
        if not matched and self.clusters:
            sorted_clusters = sorted(self.clusters.values(), key=lambda c: c.size, reverse=True)
            matched = sorted_clusters[:top_k]

        return matched
