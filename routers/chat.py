"""
routers/chat.py
---------------
AI Chat Router upgraded with GraphRAG Intelligence.
Seamlessly routes user inquiries through GraphRAG when forensic questions are asked,
while maintaining platform support guidance and preserving full backward compatibility.
"""

import logging
import os
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException
import httpx
from pydantic import BaseModel

from graphrag.schema import QueryIntent
from graphrag.service import GraphRAGService

router = APIRouter()
logger = logging.getLogger("routers.chat")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


SUPPORT_SYSTEM_PROMPT = """You are 'Sentinel Support', an AI guidance operator for CryptoTracker Analytics (CryptoTracker Sentinel).
Your tone is authoritative, concise, and professional.

SYSTEM CONTEXT & CAPABILITIES:
1. GRAPH EXPLORER: Multi-hop on-chain fund flows, peel chains, and off-ramp identification to known VASPs.
2. TRACE ENGINE: Calibrated ML fraud classification (LightGBM) and forward haircut taint contagion.
3. CYPHER CONSOLE: Sandbox to run read-only Cypher queries on the Neo4j knowledge graph.
4. DOSSIER EXPORT: Generates neutral, court-ready blockchain intelligence reports and subpoena lead lists.
5. GRAPHRAG INTELLIGENCE: Direct contextual query over the transaction graph and community clusters.

RULES:
- Answer questions clearly about platform features, cryptocurrency tracking, money laundering, and graph forensics.
- Keep answers relatively short, punchy, and formatted neatly with markdown.
"""


@router.post("/chat/message")
async def chat_message(req: ChatRequest):
    if not req.messages:
        raise HTTPException(status_code=400, detail="No messages provided.")

    latest_msg = req.messages[-1].content.strip()
    history = [m.model_dump() for m in req.messages[:-1]]

    # 1. Route through GraphRAG
    try:
        service = GraphRAGService.get_instance()
        intent_classification = service.router.classify_intent(latest_msg)

        # If it's a general support question without on-chain entities or graph requests,
        # provide guidance using the Sentinel persona
        if intent_classification.intent == QueryIntent.GENERAL_SUPPORT and not intent_classification.extracted_addresses:
            gemini_key = os.getenv("GEMINI_API_KEY")
            openrouter_key = os.getenv("OPENROUTER_API_KEY")
            if not gemini_key and not openrouter_key:
                raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not set.")

            if gemini_key:
                model = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={gemini_key}"
                contents = [
                    {"role": "user" if m.role == "user" else "model", "parts": [{"text": m.content}]}
                    for m in req.messages[-5:]
                ]
                payload = {
                    "system_instruction": {"parts": [{"text": SUPPORT_SYSTEM_PROMPT}]},
                    "contents": contents,
                    "generationConfig": {"temperature": 0.3, "maxOutputTokens": 450}
                }
                async with httpx.AsyncClient(timeout=25.0) as client:
                    res = await client.post(url, json=payload)
                    if not res.is_success:
                        raise Exception(f"HTTP {res.status_code}: {res.text}")
                    data = res.json()
                    ai_reply = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                    return {"content": ai_reply, "intent": "general_support", "citations": []}
            else:
                payload_messages = [{"role": "system", "content": SUPPORT_SYSTEM_PROMPT}]
                for msg in req.messages[-5:]:
                    payload_messages.append({"role": msg.role, "content": msg.content})

                async with httpx.AsyncClient(timeout=25.0) as client:
                    res = await client.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers={"Authorization": f"Bearer {openrouter_key}", "Content-Type": "application/json"},
                        json={
                            "model": "openai/gpt-4o-mini",
                            "messages": payload_messages,
                            "temperature": 0.3,
                            "max_tokens": 450
                        }
                    )
                    if not res.is_success:
                        raise Exception(f"HTTP {res.status_code}: {res.text}")
                    data = res.json()
                    ai_reply = data["choices"][0]["message"]["content"].strip()
                    return {"content": ai_reply, "intent": "general_support", "citations": []}

        # Otherwise, query GraphRAG over on-chain Neo4j context
        response = await service.query(latest_msg, chat_history=history)
        return {
            "content": response.answer,
            "citations": [c.model_dump() for c in response.citations],
            "intent": response.intent.value,
            "context_summary": response.context_summary
        }

    except Exception as e:
        logger.error(f"Error handling chat message: {e}")
        raise HTTPException(status_code=500, detail=f"AI Intelligence Query Failed: {str(e)}")
