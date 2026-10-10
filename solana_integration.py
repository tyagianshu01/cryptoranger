import os
import time
import requests
from neo4j import GraphDatabase
from config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, SOLANA_RPC_URL


def fetch_solana_transactions(address: str, limit: int = 100, rpc_url: str = None) -> list:
    """
    Fetches raw parsed Solana transaction records for a wallet using the Solana JSON-RPC API.
    
    Returns a list of dicts formatted as:
    [
        {
            "signature": str,
            "block_time": int,
            "transaction": {
                "meta": {...},
                "transaction": {
                    "message": {...}
                }
            }
        },
        ...
    ]
    """
    url = rpc_url or SOLANA_RPC_URL or "https://api.mainnet-beta.solana.com"
    headers = {"Content-Type": "application/json"}

    print(f"[Solana RPC] Fetching up to {limit} signatures for address: {address}...")
    # Step 1: Fetch recent signatures for the account
    sig_payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getSignaturesForAddress",
        "params": [
            address,
            {"limit": limit}
        ]
    }

    try:
        resp = requests.post(url, json=sig_payload, headers=headers, timeout=15)
        if resp.status_code != 200:
            print(f"[Solana RPC Error] HTTP {resp.status_code}: {resp.text}")
            return []
        data = resp.json()
        signatures_info = data.get("result", [])
    except Exception as e:
        print(f"[Solana RPC Exception] Failed to fetch signatures: {e}")
        return []

    if not signatures_info or not isinstance(signatures_info, list):
        print(f"[Solana RPC] No transaction signatures found for address: {address}")
        return []

    print(f"[Solana RPC] Retrieved {len(signatures_info)} signatures. Fetching parsed transaction payloads...")

    raw_transactions = []
    for item in signatures_info:
        sig = item.get("signature") if isinstance(item, dict) else str(item)
        if not sig:
            continue

        tx_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getTransaction",
            "params": [
                sig,
                {
                    "encoding": "jsonParsed",
                    "maxSupportedTransactionVersion": 0
                }
            ]
        }

        max_retries = 3
        for attempt in range(max_retries):
            try:
                tx_resp = requests.post(url, json=tx_payload, headers=headers, timeout=15)
                if tx_resp.status_code == 200:
                    tx_json = tx_resp.json()
                    tx_result = tx_json.get("result")
                    if tx_result:
                        raw_transactions.append({
                            "signature": sig,
                            "block_time": item.get("blockTime") or tx_result.get("blockTime"),
                            "transaction": tx_result
                        })
                    break
                elif tx_resp.status_code == 429:
                    # Solana public RPC rate limit: back off and retry
                    wait_time = 1.2 * (attempt + 1)
                    time.sleep(wait_time)
                else:
                    print(f"[Solana RPC Error] Failed fetching tx {sig}: HTTP {tx_resp.status_code}")
                    break
            except Exception as err:
                print(f"[Solana RPC Exception] Failed fetching tx {sig}: {err}")
                break

        # Gentle throttle between calls
        time.sleep(0.25)

    print(f"[Solana RPC] Successfully fetched {len(raw_transactions)} parsed transactions.")
    return raw_transactions


def extract_transfers(tx_record: dict) -> list:
    """Extract point-to-point SOL and SPL Token transfers from a parsed transaction."""
    tx_root = tx_record.get("transaction") if isinstance(tx_record, dict) else {}
    if isinstance(tx_root, dict) and "meta" in tx_root:
        meta = tx_root.get("meta") or {}
    else:
        meta = tx_record.get("meta") or {}

    if not meta or meta.get("err"): 
        return [] 
        
    tx_body = tx_root["transaction"] if isinstance(tx_root, dict) and "transaction" in tx_root else tx_root
    msg = tx_body.get("message", {}) if isinstance(tx_body, dict) else {}
    if not msg:
        return []

    # 1. Map account indexes to actual base58 addresses (Including ALTs)
    account_keys = []
    for acc in msg.get("accountKeys", []):
        account_keys.append(acc.get("pubkey", "") if isinstance(acc, dict) else str(acc))
    
    loaded_addresses = meta.get("loadedAddresses", {}) if isinstance(meta, dict) else {}
    if loaded_addresses:
        account_keys.extend(str(addr) for addr in loaded_addresses.get("writable", []))
        account_keys.extend(str(addr) for addr in loaded_addresses.get("readonly", []))
    
    # 2. Map Token Accounts -> Owners, Mints, and Decimals (Pre + Post for closed accounts)
    token_account_to_owner = {}
    all_token_balances = meta.get("preTokenBalances", []) + meta.get("postTokenBalances", [])
    
    for balance in all_token_balances:
        idx = balance.get("accountIndex")
        if idx is not None and idx < len(account_keys):
            ui_token_amount = balance.get("uiTokenAmount", {})
            token_account_to_owner[account_keys[idx]] = {
                "owner": balance.get("owner"),
                "mint": balance.get("mint"),
                "decimals": ui_token_amount.get("decimals", 0)
            }
            
    # 3. Flatten instructions
    all_instructions = list(msg.get("instructions", []))
    for inner in meta.get("innerInstructions", []):
        all_instructions.extend(inner.get("instructions", []))
        
    transfers = []
    signature = tx_record.get("signature") or (tx_body.get("signatures", [None])[0] if isinstance(tx_body, dict) else None)
    block_time = tx_record.get("block_time") or tx_record.get("blockTime")
    
    for inst in all_instructions:
        if not isinstance(inst, dict) or "parsed" not in inst:
            continue
            
        parsed = inst["parsed"]
        program = inst.get("program")
        info = parsed.get("info", {})
        
        # --- Native SOL Transfer ---
        if program == "system" and parsed.get("type") in ("transfer", "transferWithSeed"):
            lamports = info.get("lamports", 0)
            try:
                amount_sol = float(lamports) / 1e9
            except (ValueError, TypeError):
                amount_sol = 0.0

            transfers.append({
                "source": info.get("source"),
                "destination": info.get("destination"),
                "amount": amount_sol,
                "token": "SOL",
                "signature": signature,
                "block_time": block_time
            })
            
        # --- SPL Token Transfer (spl-token + spl-token-2022) ---
        elif program in ("spl-token", "spl-token-2022") and parsed.get("type") in (
            "transfer", "transferChecked", "transferWithFee"
        ):
            src_acc = info.get("source")
            dst_acc = info.get("destination")
            
            src_data = token_account_to_owner.get(src_acc, {})
            dst_data = token_account_to_owner.get(dst_acc, {})
            
            src_owner = src_data.get("owner", src_acc)
            dst_owner = dst_data.get("owner", dst_acc)
            mint = src_data.get("mint") or dst_data.get("mint", "UNKNOWN_MINT")
            
            # Robust amount extraction
            final_amount = 0.0
            if "tokenAmount" in info:
                ta = info["tokenAmount"]
                ui_amt = ta.get("uiAmount")
                if ui_amt is not None:
                    final_amount = float(ui_amt)
                elif ta.get("uiAmountString"):
                    try:
                        final_amount = float(ta["uiAmountString"])
                    except (ValueError, TypeError):
                        final_amount = 0.0
                else:
                    try:
                        raw_amount = float(ta.get("amount", 0))
                        decimals = ta.get("decimals", 0)
                        final_amount = raw_amount / (10 ** decimals) if decimals else raw_amount
                    except (ValueError, TypeError):
                        final_amount = 0.0
            else:
                try:
                    raw_amount = float(info.get("amount", 0))
                    decimals = src_data.get("decimals") or dst_data.get("decimals", 0)
                    final_amount = raw_amount / (10 ** decimals) if decimals else raw_amount
                except (ValueError, TypeError):
                    final_amount = 0.0

            transfers.append({
                "source": src_owner,
                "destination": dst_owner,
                "amount": final_amount,
                "token": mint,
                "signature": signature,
                "block_time": block_time
            })
            
    # 4. Balance delta fallback (Two-pointer consumption)
    if not transfers:
        pre_balances = meta.get("preBalances", [])
        post_balances = meta.get("postBalances", [])
        
        if pre_balances and post_balances and len(pre_balances) == len(post_balances):
            senders = []   # [[account_index, lamports_lost]]
            receivers = [] # [[account_index, lamports_gained]]
            
            for i in range(min(len(pre_balances), len(account_keys))):
                delta = post_balances[i] - pre_balances[i]
                if delta < -5000:   # Filter out base transaction fees
                    senders.append([i, abs(delta)])
                elif delta > 5000:  
                    receivers.append([i, delta])
            
            s_idx, r_idx = 0, 0
            while s_idx < len(senders) and r_idx < len(receivers):
                s_acc_idx, s_rem = senders[s_idx]
                r_acc_idx, r_rem = receivers[r_idx]
                
                xfer_lamports = min(s_rem, r_rem)
                
                transfers.append({
                    "source": account_keys[s_acc_idx],
                    "destination": account_keys[r_acc_idx],
                    "amount": float(xfer_lamports) / 1e9,
                    "token": "SOL",
                    "signature": signature,
                    "block_time": block_time
                })
                
                senders[s_idx][1] -= xfer_lamports
                receivers[r_idx][1] -= xfer_lamports
                
                if senders[s_idx][1] == 0:
                    s_idx += 1
                if receivers[r_idx][1] == 0:
                    r_idx += 1

    return transfers


class SolanaGraphDB:
    def __init__(self, uri=None, user=None, password=None):
        self.uri = uri or NEO4J_URI
        self.user = user or NEO4J_USER
        self.password = password or NEO4J_PASSWORD
        self.driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))

    def close(self):
        self.driver.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def insert_transfers(self, transfers):
        if not transfers:
            print("No transfers provided to insert.")
            return

        cypher_query = """
        UNWIND $transfers AS tx
        MERGE (sender:Account {address: tx.source})
        MERGE (receiver:Account {address: tx.destination})
        
        // Use MERGE instead of CREATE to prevent duplicate edges
        MERGE (sender)-[r:TRANSFERRED {
            signature: tx.signature, 
            amount: tx.amount, 
            token: tx.token
        }]->(receiver)
        ON CREATE SET r.timestamp = tx.block_time
        """
        
        with self.driver.session() as session:
            session.run(cypher_query, transfers=transfers)
            print(f"Successfully inserted {len(transfers)} transfers into Neo4j.")


def ingest_solana_wallet(address: str, limit: int = 10, rpc_url: str = None, graph_db: SolanaGraphDB = None) -> list:
    """
    End-to-end pipeline:
    1. Fetches parsed transactions from Solana JSON-RPC.
    2. Extracts SOL and SPL Token transfers.
    3. Persists transfers to Neo4j.
    Returns all extracted transfers.
    """
    raw_txs = fetch_solana_transactions(address, limit=limit, rpc_url=rpc_url)
    all_transfers = []
    for tx in raw_txs:
        all_transfers.extend(extract_transfers(tx))

    if all_transfers:
        should_close = False
        if graph_db is None:
            graph_db = SolanaGraphDB()
            should_close = True

        try:
            graph_db.insert_transfers(all_transfers)
        finally:
            if should_close:
                graph_db.close()

    return all_transfers


# --- Execution Example ---
if __name__ == "__main__":
    import sys
    test_wallet = sys.argv[1] if len(sys.argv) > 1 else "Vote111111111111111111111111111111111111111"
    print(f"Running Solana Ingestion test for wallet: {test_wallet}")
    # 1. Fetch data
    raw_transactions = fetch_solana_transactions(test_wallet, limit=20)

    # 2. Extract transfers
    all_transfers = []
    for tx in raw_transactions:
        all_transfers.extend(extract_transfers(tx))

    print(f"Extracted {len(all_transfers)} transfers.")
    for t in all_transfers[:3]:
        print("Transfer sample:", t)

    # 3. Push to Graph
    if all_transfers:
        graph_db = SolanaGraphDB()
        graph_db.insert_transfers(all_transfers)
        graph_db.close()
