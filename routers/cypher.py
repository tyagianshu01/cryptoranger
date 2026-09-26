import os
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db_connect import get_db_driver

router = APIRouter()

class CypherGenerateRequest(BaseModel):
    prompt: str

class CypherExecuteRequest(BaseModel):
    query: str

CYPHER_SYSTEM_PROMPT = """You are a master Neo4j database architect for a Cyber Forensics unit.
Your task is to translate natural language investigative questions into highly optimized, read-only Cypher queries.

GRAPH SCHEMA:
Nodes: 
  - (Wallet {address: String})
  - (Transaction {hash: String, timestamp: DateTime, value_eth: Float})

Relationships (Tripartite Model): 
  - (Wallet)-[:SENT]->(Transaction)
  - (Transaction)-[:TO]->(Wallet)

RULES:
1. ONLY return the raw, unformatted Cypher code block. Do NOT use markdown code blocks (```cypher...```). Return just the strict query string.
2. Ensure queries use aliases safely (e.g., sender, tx, receiver).
3. NEVER generate CREATE, DELETE, DETACH, SET, MERGE, or DROP commands. Read-only strictly.
4. When possible, limit wild scans with LIMIT 100 unless requested otherwise.
"""

@router.post("/cypher/generate")
async def generate_cypher(req: CypherGenerateRequest):
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY is not set in the environment.")

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
                    "messages": [
                        {"role": "system", "content": CYPHER_SYSTEM_PROMPT},
                        {"role": "user", "content": req.prompt}
                    ],
                    "temperature": 0.0,
                    "max_tokens": 800
                },
                timeout=30.0
            )
            if not response.is_success:
                raise Exception(f"HTTP {response.status_code}: {response.text}")
                
            data = response.json()
            
        raw_cypher = data["choices"][0]["message"]["content"].strip()
        # Fallback strip if the LLM ignores instruction #1
        if raw_cypher.startswith("```"):
            lines = raw_cypher.split("\n")
            if len(lines) > 2:
                raw_cypher = "\n".join(lines[1:-1])
                
        return {"query": raw_cypher.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM Generation Error: {str(e)}")


@router.post("/cypher/execute")
def execute_cypher(req: CypherExecuteRequest):
    driver = get_db_driver()
    if not driver:
        raise HTTPException(status_code=500, detail="Neo4j connection is broken.")

    # Extremely rudimentary block just as a software safety net.
    # The actual hardware-level safety net is `read_transaction` below.
    forbidden = ["DELETE", "CREATE", "SET", "MERGE", "DROP", "REMOVE"]
    upper_q = req.query.upper()
    if any(f in upper_q for f in forbidden):
        raise HTTPException(status_code=403, detail="SANDBOX VIOLATION: Mutation keywords detected.")

    try:
        def read_ops(tx, q):
            result = tx.run(q)
            # Serialize the neo4j.Record objects safely
            output = []
            for record in result:
                row_dict = {}
                for key in record.keys():
                    val = record[key]
                    if hasattr(val, "element_id"): 
                        struct = {
                            "id": val.element_id, 
                            "labels": list(getattr(val, "labels", [])), 
                            "type": getattr(val, "type", ""), 
                            "properties": dict(val)
                        }
                        if hasattr(val, "start_node"):
                            struct["source"] = val.start_node.element_id
                            struct["target"] = val.end_node.element_id
                        row_dict[key] = struct
                    elif isinstance(val, dict):
                        row_dict[key] = val
                    elif isinstance(val, list):
                        # Simple serialization for list properties
                        row_dict[key] = [dict(v) if hasattr(v, "element_id") else v for v in val]
                    else:
                        row_dict[key] = val
                output.append(row_dict)
            return {"columns": result.keys(), "data": output}

        with driver.session() as session:
            # FORCE READ ONLY TRANSACTION
            # If the user tries a SET command, Neo4j will crash the transaction with an access exception!
            payload = session.execute_read(read_ops, req.query)
            return payload

    except Exception as e:
        # Pass the exact Cypher Syntax Error back to the UI
        raise HTTPException(status_code=400, detail=f"Cypher Error: {str(e)}")
