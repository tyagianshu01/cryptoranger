"""
routers/graphrag.py
-------------------
Dedicated FastAPI router exposing GraphRAG querying, community inspection,
and indexing endpoints.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from graphrag.service import GraphRAGService

router = APIRouter(prefix="/graphrag", tags=["GraphRAG"])


class GraphRAGQueryRequest(BaseModel):
    prompt: str
    chat_history: Optional[List[Dict[str, str]]] = None


@router.post("/query")
async def query_graphrag(req: GraphRAGQueryRequest):
    """
    Executes an evidence-grounded GraphRAG query over the Neo4j transaction graph.
    """
    service = GraphRAGService.get_instance()
    try:
        response = await service.query(req.prompt, chat_history=req.chat_history)
        return {
            "answer": response.answer,
            "intent": response.intent,
            "citations": [c.model_dump() for c in response.citations],
            "context_summary": response.context_summary,
            "communities_referenced": response.communities_referenced
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"GraphRAG Query Failed: {str(e)}")


@router.get("/communities")
def list_communities():
    """
    Lists detected topological communities, volume, and summaries from the graph.
    """
    service = GraphRAGService.get_instance()
    communities = service.get_all_communities()
    return {
        "count": len(communities),
        "communities": [c.model_dump() for c in communities]
    }


@router.post("/index")
async def trigger_reindex(background_tasks: BackgroundTasks):
    """
    Triggers an asynchronous re-indexing and community clustering across Neo4j.
    """
    service = GraphRAGService.get_instance()
    background_tasks.add_task(service.reindex)
    return {"message": "GraphRAG re-indexing initiated in the background."}
