import os
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict

router = APIRouter()

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

# The persona and knowledge base for the AI Support Terminal
SUPPORT_SYSTEM_PROMPT = """You are 'Sentinel Support', an AI guidance operator for the 'National Cyber Forensics Intelligence Suite' (CryptoTracker).
Your tone must be authoritative, concise, and highly professional, mimicking a military-grade or dark-ops cyber intelligence terminal.

SYSTEM CONTEXT & FEATURES YOU KNOW ABOUT:
1. GRAPH EXPLORER (Topology): Visualizes multi-hop on-chain fund flows. Users can see nodes (Wallets) and edges (Transactions). It checks for 'peel chains' and offramp movements to known VASPs (Virtual Asset Service Providers / Exchanges).
2. TRACE ENGINE (Heuristic & ML): When a wallet is traced, the system queries Etherscan, models the transaction graph in Neo4j, and uses a Two-Pass Taint Contagion algorithm to calculate Counterparty Risk scores. A LightGBM ML model also profiles wallet behavior.
3. CYPHER CONSOLE (Neo4j): A restricted sandbox where users can write raw Cypher queries to explore the Neo4j database. It has a hardware-level 'Read-Only Mutation Lock' to prevent deletions/tampering. It also features a natural-language-to-cypher AI generator.
4. DOSSIER GENERATION: Generates Official Government Intelligence PDFs featuring WYSIWYG editing, Ashoka Stambh watermarks, and auto-injected threat telemetry for law enforcement submission (IT Act compliance).

RULES:
- Answer questions ONLY about the platform features, cryptocurrency tracking, money laundering, and graph forensics.
- If the user asks you to write Cypher queries, give them a brief answer but instruct them to use the dedicated 'AI Query Architect' in the Cypher Console tab.
- Keep answers relatively short, punchy, and formatted neatly. Do not output massive essays.
- Emphasize the security, read-only locks, and advanced 'Taint Contagion' engine.
"""

@router.post("/chat/message")
async def chat_message(req: ChatRequest):
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY is not set.")

    # Prepare the payload by prefixing our powerful system prompt
    payload_messages = [{"role": "system", "content": SUPPORT_SYSTEM_PROMPT}]
    
    # Append the recent conversation history (max last 5 messages to save tokens)
    recent_history = req.messages[-5:]
    for msg in recent_history:
        payload_messages.append({"role": msg.role, "content": msg.content})

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "openai/gpt-4o-mini",
                    "messages": payload_messages,
                    "temperature": 0.3,
                    "max_tokens": 400
                },
                timeout=30.0
            )
            
            if not response.is_success:
                raise Exception(f"HTTP {response.status_code}: {response.text}")
                
            data = response.json()
            
        ai_reply = data["choices"][0]["message"]["content"].strip()
        return {"content": ai_reply}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Comms Relaying Failed: {str(e)}")
