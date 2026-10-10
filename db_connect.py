from datetime import datetime
import networkx as nx
from neo4j import GraphDatabase
from config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD


def get_db_driver():
    """Initializes and returns the Neo4j driver connection."""
    try:
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        driver.verify_connectivity()
        return driver
    except Exception as e:
        print(f"Neo4j Connection failed! Error: {e}")
        return None


def store_in_neo4j(driver, data):
    """
    Parses and bulk-inserts Etherscan data into Neo4j.
    Accepts the dict returned by fetch_transactions: {"normal": [...], "erc20": [...]}
    """
    if not data:
        return

    normal_txs = data.get("normal", [])
    erc20_txs = data.get("erc20", [])

    # --- Normal Transactions ---
    cypher_normal = '''
    UNWIND $batch AS tx_data
    MERGE (sender:Wallet {address: tx_data.from_address})
    MERGE (receiver:Wallet {address: tx_data.to_address})
    MERGE (tx:Transaction {hash: tx_data.tx_hash})
    ON CREATE SET
        tx.timestamp = datetime(tx_data.timestamp),
        tx.value_eth = tx_data.value_eth,
        tx.is_contract_creation = tx_data.is_contract_creation
    MERGE (sender)-[:SENT]->(tx)
    MERGE (tx)-[:TO]->(receiver)
    '''

    batch_normal = []
    for tx in normal_txs:
        try:
            val_eth = float(tx['value']) / 10**18
            if val_eth == 0:
                continue
            batch_normal.append({
                'from_address': tx['from'].lower(),
                'to_address': tx['to'].lower() if tx['to'] else "contract_creation",
                'tx_hash': tx['hash'],
                'timestamp': datetime.fromtimestamp(int(tx['timeStamp'])).isoformat(),
                'value_eth': val_eth,
                'is_contract_creation': tx.get('to') is None or tx.get('to') == ''
            })
        except Exception:
            pass

    # --- ERC20 Token Transactions ---
    cypher_erc20 = '''
    UNWIND $batch AS tx_data
    MERGE (sender:Wallet {address: tx_data.from_address})
    MERGE (receiver:Wallet {address: tx_data.to_address})
    MERGE (tx:TokenTransfer {hash: tx_data.tx_hash})
    ON CREATE SET
        tx.timestamp = datetime(tx_data.timestamp),
        tx.value_token = tx_data.value_token,
        tx.token_name = tx_data.token_name,
        tx.token_symbol = tx_data.token_symbol,
        tx.contract_address = tx_data.contract_address
    MERGE (sender)-[:SENT_TOKEN]->(tx)
    MERGE (tx)-[:TOKEN_TO]->(receiver)
    '''

    batch_erc20 = []
    for tx in erc20_txs:
        try:
            decimals = int(tx.get('tokenDecimal', 18))
            val_token = float(tx['value']) / (10**decimals)
            if val_token == 0:
                continue
            batch_erc20.append({
                'from_address': tx['from'].lower(),
                'to_address': tx['to'].lower(),
                'tx_hash': tx['hash'],
                'timestamp': datetime.fromtimestamp(int(tx['timeStamp'])).isoformat(),
                'value_token': val_token,
                'token_name': tx.get('tokenName', 'Unknown'),
                'token_symbol': tx.get('tokenSymbol', 'Unknown'),
                'contract_address': tx.get('contractAddress', '').lower()
            })
        except Exception:
            pass

    with driver.session() as session:
        if batch_normal:
            session.run(cypher_normal, batch=batch_normal)
        if batch_erc20:
            session.run(cypher_erc20, batch=batch_erc20)

    print(f"Saved {len(batch_normal)} normal + {len(batch_erc20)} ERC20 transactions to Neo4j.")

def get_networkx_from_neo4j(driver):
    """Pulls the current state of the Neo4j database into a NetworkX DiGraph (supports ETH & Solana)."""
    query_eth = """
    MATCH (s:Wallet)-[:SENT]->(tx:Transaction)-[:TO]->(r:Wallet)
    RETURN s.address AS sender, r.address AS receiver, sum(tx.value_eth) AS total_amount
    """
    query_sol = """
    MATCH (s:Account)-[r:TRANSFERRED]->(recv:Account)
    RETURN s.address AS sender, recv.address AS receiver, sum(r.amount) AS total_amount
    """
    G = nx.DiGraph()
    with driver.session() as session:
        result_eth = session.run(query_eth)
        for record in result_eth:
            G.add_edge(record["sender"], record["receiver"], weight=record["total_amount"])

        result_sol = session.run(query_sol)
        for record in result_sol:
            sender = record["sender"]
            recv = record["receiver"]
            amt = record["total_amount"] or 0.0
            curr_weight = G.get_edge_data(sender, recv, {}).get("weight", 0.0)
            G.add_edge(sender, recv, weight=curr_weight + amt)
    return G


# Convenient re-export for consumers importing from db_connect
from solana_integration import SolanaGraphDB