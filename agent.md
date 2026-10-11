# CryptoTracker Sentinel - Agent Context & Instructions

## Project Overview
This repository contains "CryptoTracker Sentinel," a National Cyber Forensics Intelligence Suite used for blockchain surveillance and heuristic graph analysis.

## Core Stack
- **Backend:** Python 3.10+, FastAPI
- **Frontend:** Node.js v18+, React / Vite (located in `/sentinel`)
- **Database:** Neo4j (Tripartite model: Wallets and Transactions)
- **Machine Learning:** LightGBM (`pure_crypto_fraud_model.txt`)
- **LLM Provider:** Gemini API (formerly OpenRouter)
- **External Data:** Etherscan API

## Key Modules
1. **Trace Engine (Taint Contagion):** Iterative BFS algorithm hitting Etherscan block history to trace multi-hop transactions. Evaluates degree centrality, log-scaled volume, and proximity to suspicious clusters.
2. **Cypher Sandbox (routers/cypher.py):** Secure, strictly read-only endpoint that executes AI-generated Cypher queries using a hardware-level read lock.
3. **AI Support Terminal (routers/chat.py):** Authoritative, military-grade AI guidance operator for the terminal.
4. **Dossier Editor:** React-driven WYSIWYG generator for official government intelligence PDFs (IT Act compliance, Ashoka Stambh watermarks).

## Agent Directives for this Workspace
- When modifying Neo4j queries, NEVER generate `CREATE`, `DELETE`, `SET`, `MERGE`, or `DROP`. The database is strictly read-only for analytical purposes.
- When working on the frontend (`/sentinel`), ensure changes adhere to modern UI/UX principles, as it is a highly professional forensics tool.
- Always use `GEMINI_API_KEY` for LLM operations.
- Remember the system is designed to identify single/multi-hop peel chains and tracking offramps to VASPs (Virtual Asset Service Providers).
