# CryptoTracker Sentinel

Sentinel is an advanced blockchain surveillance and heuristic graph analysis engine. It was built to trace multi-hop transactions, identify Virtual Asset Service Provider (VASP) offramps, and apply programmatic counterparty risk models to isolate money laundering peel chains.

## Core Architecture

The platform operates on a dual-validation pipeline:
- **Graph Heuristics (Taint Contagion):** Automatically traces recursive fund flows via Etherscan, mapping nodes to a Neo4j tripartite schema. A mathematical Two-Pass algorithm measures degree centrality, log-scaled volume, and proximity to suspicious clusters to calculate persistent risk.
- **Machine Learning (LightGBM):** A local boosted decision-tree model evaluates behavioral metadata at execution time, isolating known fraud signatures without needing third-party API dependencies.

## Setup & Local Deployment

### 1. Requirements
- Python 3.10+
- Node.js v18+
- Active Neo4j instance (AuraDB Cloud or local desktop)

### 2. Environment Variables
You need a `.env` file in the root directory (or inject these into your hosting provider):
```ini
# Etherscan
ETHERSCAN_API_KEY=your_key_here

# Neo4j Database Configuration
NEO4J_URI=bolt+s://your-instance-id.databases.neo4j.io
NEO4J_USER=your_assigned_username
NEO4J_PASSWORD=your_assigned_password

# Optional: Cypher Console AI
OPENROUTER_API_KEY=your_openrouter_key
```

### 3. Backend (FastAPI / Machine Learning)
```bash
# Install pip dependencies
pip install -r requirements.txt

# Start the uvicorn server
python main.py
```
*Note: Make sure `pure_crypto_fraud_model.txt` is in the root directory for the LightGBM instance to load successfully. If missing, the trace engine will automatically fail back to heuristic-only mode.*

### 4. Frontend (React / Vite)
```bash
cd sentinel
npm install
npm run dev
```
For production build compilation:
```bash
npm run build
```

## Module Overview

- **/Trace Engine:** Iterative BFS algorithm hitting Etherscan block history and caching relations in Neo4j.
- **/Cypher Sandbox:** Secure `/cypher/execute` REST endpoint forcing a `.execute_read()` sandbox wrapper inside the Python driver. Prevents graph mutation natively.
- **/Dossier Editor:** React-driven WYSIWYG generator. Converts raw forensic data natively into PDF schemas designed for agency compliance formatting.

## License
Restricted Internal Use / Open Source hybrid depending on deployment environment. 
