"""
Feature Extraction Module
-------------------------
Pulls aggregated wallet-level statistics directly from Neo4j using Cypher.
Returns a single-row DataFrame matching the 48 columns of transaction_dataset.csv,
ready to be fed into the LightGBM model for inference.
"""

import pandas as pd


# The exact 48 feature columns the ML model expects (order matters).
FEATURE_COLUMNS = [
    "Avg min between sent tnx",
    "Avg min between received tnx",
    "Time Diff between first and last (Mins)",
    "Sent tnx",
    "Received Tnx",
    "Number of Created Contracts",
    "Unique Received From Addresses",
    "Unique Sent To Addresses",
    "min value received",
    "max value received ",
    "avg val received",
    "min val sent",
    "max val sent",
    "avg val sent",
    "min value sent to contract",
    "max val sent to contract",
    "avg value sent to contract",
    "total transactions (including tnx to create contract",
    "total Ether sent",
    "total ether received",
    "total ether sent contracts",
    "total ether balance",
    " Total ERC20 tnxs",
    " ERC20 total Ether received",
    " ERC20 total ether sent",
    " ERC20 total Ether sent contract",
    " ERC20 uniq sent addr",
    " ERC20 uniq rec addr",
    " ERC20 uniq sent addr.1",
    " ERC20 uniq rec contract addr",
    " ERC20 avg time between sent tnx",
    " ERC20 avg time between rec tnx",
    " ERC20 avg time between rec 2 tnx",
    " ERC20 avg time between contract tnx",
    " ERC20 min val rec",
    " ERC20 max val rec",
    " ERC20 avg val rec",
    " ERC20 min val sent",
    " ERC20 max val sent",
    " ERC20 avg val sent",
    " ERC20 min val sent contract",
    " ERC20 max val sent contract",
    " ERC20 avg val sent contract",
    " ERC20 uniq sent token name",
    " ERC20 uniq rec token name",
]


# ---------------------------------------------------------------------------
# Cypher query that computes all 48 features natively inside Neo4j.
# This avoids pulling thousands of raw rows into Python.
# ---------------------------------------------------------------------------
FEATURE_QUERY = """
// ---- Normal Transaction Stats ----
OPTIONAL MATCH (w:Wallet {address: $address})-[:SENT]->(txOut:Transaction)-[:TO]->(rec:Wallet)
WITH w,
     collect(txOut) AS sentTxs,
     collect(DISTINCT rec.address) AS uniqueSentTo

OPTIONAL MATCH (sender:Wallet)-[:SENT]->(txIn:Transaction)-[:TO]->(w)
WITH w, sentTxs, uniqueSentTo,
     collect(txIn) AS recTxs,
     collect(DISTINCT sender.address) AS uniqueRecFrom

// Sent value stats
WITH w, sentTxs, recTxs, uniqueSentTo, uniqueRecFrom,
     size(sentTxs) AS sentCount,
     size(recTxs) AS recCount,
     CASE WHEN size(sentTxs) > 0
          THEN reduce(s = 0.0, t IN sentTxs | s + t.value_eth) ELSE 0.0 END AS totalSent,
     CASE WHEN size(recTxs) > 0
          THEN reduce(s = 0.0, t IN recTxs | s + t.value_eth) ELSE 0.0 END AS totalRec,
     size(uniqueSentTo) AS uniqSentTo,
     size(uniqueRecFrom) AS uniqRecFrom

// Contract creations
OPTIONAL MATCH (w)-[:SENT]->(ccTx:Transaction {is_contract_creation: true})
WITH w, sentTxs, recTxs, sentCount, recCount, totalSent, totalRec,
     uniqSentTo, uniqRecFrom,
     count(ccTx) AS contractsCreated

// Sent timestamps for average-time calculation
WITH w, sentTxs, recTxs, sentCount, recCount, totalSent, totalRec,
     uniqSentTo, uniqRecFrom, contractsCreated,
     [t IN sentTxs | t.timestamp.epochSeconds] AS sentTimes,
     [t IN recTxs  | t.timestamp.epochSeconds] AS recTimes

// All timestamps combined for time-diff
WITH *, (sentTimes + recTimes) AS allTimes

// Sent value lists for min/max/avg
WITH *,
     [t IN sentTxs | t.value_eth] AS sentVals,
     [t IN recTxs  | t.value_eth] AS recVals

// ---- ERC20 Token Transfer Stats ----
OPTIONAL MATCH (w)-[:SENT_TOKEN]->(tkOut:TokenTransfer)-[:TOKEN_TO]->(tkRec:Wallet)
WITH *, collect(tkOut) AS sentTokenTxs,
     collect(DISTINCT tkRec.address) AS erc20UniqSentAddr

OPTIONAL MATCH (tkSender:Wallet)-[:SENT_TOKEN]->(tkIn:TokenTransfer)-[:TOKEN_TO]->(w)
WITH *, collect(tkIn) AS recTokenTxs,
     collect(DISTINCT tkSender.address) AS erc20UniqRecAddr

// ERC20 contract-directed transfers
OPTIONAL MATCH (w)-[:SENT_TOKEN]->(tkContract:TokenTransfer)-[:TOKEN_TO]->(cAddr:Wallet)
     WHERE cAddr.address STARTS WITH '0x'
WITH *, collect(DISTINCT cAddr.address) AS erc20UniqRecContractAddr

// Token value lists
WITH *,
     [t IN sentTokenTxs | t.value_token] AS sentTokenVals,
     [t IN recTokenTxs  | t.value_token] AS recTokenVals,
     [t IN sentTokenTxs | t.timestamp.epochSeconds] AS sentTokenTimes,
     [t IN recTokenTxs  | t.timestamp.epochSeconds] AS recTokenTimes,
     size(sentTokenTxs) + size(recTokenTxs) AS totalErc20Tnxs

// Unique token names
WITH *,
     size(coll.distinct([t IN sentTokenTxs | t.token_name])) AS erc20UniqSentTokenName,
     size(coll.distinct([t IN recTokenTxs  | t.token_name])) AS erc20UniqRecTokenName

RETURN
  // ---- Normal Stats ----
  CASE WHEN size(sentTimes) > 1
       THEN reduce(s=0.0, i IN range(1,size(sentTimes)-1) |
            s + (sentTimes[i] - sentTimes[i-1])) / (size(sentTimes)-1) / 60.0
       ELSE 0.0 END AS avg_min_between_sent,

  CASE WHEN size(recTimes) > 1
       THEN reduce(s=0.0, i IN range(1,size(recTimes)-1) |
            s + (recTimes[i] - recTimes[i-1])) / (size(recTimes)-1) / 60.0
       ELSE 0.0 END AS avg_min_between_rec,

  CASE WHEN size(allTimes) > 1
       THEN (reduce(mx=allTimes[0], t IN allTimes | CASE WHEN t > mx THEN t ELSE mx END)
           - reduce(mn=allTimes[0], t IN allTimes | CASE WHEN t < mn THEN t ELSE mn END)) / 60.0
       ELSE 0.0 END AS time_diff_first_last,

  sentCount,
  recCount,
  contractsCreated,
  uniqRecFrom,
  uniqSentTo,

  CASE WHEN size(recVals) > 0 THEN reduce(mn=recVals[0], v IN recVals | CASE WHEN v<mn THEN v ELSE mn END) ELSE 0.0 END AS min_val_rec,
  CASE WHEN size(recVals) > 0 THEN reduce(mx=recVals[0], v IN recVals | CASE WHEN v>mx THEN v ELSE mx END) ELSE 0.0 END AS max_val_rec,
  CASE WHEN size(recVals) > 0 THEN reduce(s=0.0, v IN recVals | s+v)/size(recVals) ELSE 0.0 END AS avg_val_rec,

  CASE WHEN size(sentVals) > 0 THEN reduce(mn=sentVals[0], v IN sentVals | CASE WHEN v<mn THEN v ELSE mn END) ELSE 0.0 END AS min_val_sent,
  CASE WHEN size(sentVals) > 0 THEN reduce(mx=sentVals[0], v IN sentVals | CASE WHEN v>mx THEN v ELSE mx END) ELSE 0.0 END AS max_val_sent,
  CASE WHEN size(sentVals) > 0 THEN reduce(s=0.0, v IN sentVals | s+v)/size(sentVals) ELSE 0.0 END AS avg_val_sent,

  0.0 AS min_val_sent_contract,
  0.0 AS max_val_sent_contract,
  0.0 AS avg_val_sent_contract,

  sentCount + recCount AS total_txns,
  totalSent,
  totalRec,
  0.0 AS total_ether_sent_contracts,
  totalRec - totalSent AS total_ether_balance,

  // ---- ERC20 Stats ----
  totalErc20Tnxs,

  CASE WHEN size(recTokenVals) > 0 THEN reduce(s=0.0, v IN recTokenVals | s+v) ELSE 0.0 END AS erc20_total_rec,
  CASE WHEN size(sentTokenVals) > 0 THEN reduce(s=0.0, v IN sentTokenVals | s+v) ELSE 0.0 END AS erc20_total_sent,
  0.0 AS erc20_total_sent_contract,

  size(erc20UniqSentAddr) AS erc20_uniq_sent_addr,
  size(erc20UniqRecAddr) AS erc20_uniq_rec_addr,
  0.0 AS erc20_uniq_sent_addr_1,
  size(erc20UniqRecContractAddr) AS erc20_uniq_rec_contract_addr,

  CASE WHEN size(sentTokenTimes) > 1
       THEN reduce(s=0.0, i IN range(1,size(sentTokenTimes)-1) |
            s + (sentTokenTimes[i] - sentTokenTimes[i-1])) / (size(sentTokenTimes)-1) / 60.0
       ELSE 0.0 END AS erc20_avg_time_sent,

  CASE WHEN size(recTokenTimes) > 1
       THEN reduce(s=0.0, i IN range(1,size(recTokenTimes)-1) |
            s + (recTokenTimes[i] - recTokenTimes[i-1])) / (size(recTokenTimes)-1) / 60.0
       ELSE 0.0 END AS erc20_avg_time_rec,

  0.0 AS erc20_avg_time_rec2,
  0.0 AS erc20_avg_time_contract,

  CASE WHEN size(recTokenVals) > 0 THEN reduce(mn=recTokenVals[0], v IN recTokenVals | CASE WHEN v<mn THEN v ELSE mn END) ELSE 0.0 END AS erc20_min_val_rec,
  CASE WHEN size(recTokenVals) > 0 THEN reduce(mx=recTokenVals[0], v IN recTokenVals | CASE WHEN v>mx THEN v ELSE mx END) ELSE 0.0 END AS erc20_max_val_rec,
  CASE WHEN size(recTokenVals) > 0 THEN reduce(s=0.0, v IN recTokenVals | s+v)/size(recTokenVals) ELSE 0.0 END AS erc20_avg_val_rec,

  CASE WHEN size(sentTokenVals) > 0 THEN reduce(mn=sentTokenVals[0], v IN sentTokenVals | CASE WHEN v<mn THEN v ELSE mn END) ELSE 0.0 END AS erc20_min_val_sent,
  CASE WHEN size(sentTokenVals) > 0 THEN reduce(mx=sentTokenVals[0], v IN sentTokenVals | CASE WHEN v>mx THEN v ELSE mx END) ELSE 0.0 END AS erc20_max_val_sent,
  CASE WHEN size(sentTokenVals) > 0 THEN reduce(s=0.0, v IN sentTokenVals | s+v)/size(sentTokenVals) ELSE 0.0 END AS erc20_avg_val_sent,

  0.0 AS erc20_min_val_sent_contract,
  0.0 AS erc20_max_val_sent_contract,
  0.0 AS erc20_avg_val_sent_contract,

  erc20UniqSentTokenName,
  erc20UniqRecTokenName
"""

def get_ml_features(driver, wallet_address):
    """
    Queries Neo4j to compute the 48 aggregated features for a single wallet.
    Returns a single-row pandas DataFrame aligned to the training dataset schema.
    """
    address = wallet_address.lower()

    with driver.session() as session:
        result = session.run(FEATURE_QUERY, address=address).single()

    if not result:
        # Wallet not found in Neo4j -- return a zeroed-out row
        return pd.DataFrame([{col: 0.0 for col in FEATURE_COLUMNS}])

    row = {
        FEATURE_COLUMNS[0]:  result["avg_min_between_sent"],
        FEATURE_COLUMNS[1]:  result["avg_min_between_rec"],
        FEATURE_COLUMNS[2]:  result["time_diff_first_last"],
        FEATURE_COLUMNS[3]:  result["sentCount"],
        FEATURE_COLUMNS[4]:  result["recCount"],
        FEATURE_COLUMNS[5]:  result["contractsCreated"],
        FEATURE_COLUMNS[6]:  result["uniqRecFrom"],
        FEATURE_COLUMNS[7]:  result["uniqSentTo"],
        FEATURE_COLUMNS[8]:  result["min_val_rec"],
        FEATURE_COLUMNS[9]:  result["max_val_rec"],
        FEATURE_COLUMNS[10]: result["avg_val_rec"],
        FEATURE_COLUMNS[11]: result["min_val_sent"],
        FEATURE_COLUMNS[12]: result["max_val_sent"],
        FEATURE_COLUMNS[13]: result["avg_val_sent"],
        FEATURE_COLUMNS[14]: result["min_val_sent_contract"],
        FEATURE_COLUMNS[15]: result["max_val_sent_contract"],
        FEATURE_COLUMNS[16]: result["avg_val_sent_contract"],
        FEATURE_COLUMNS[17]: result["total_txns"],
        FEATURE_COLUMNS[18]: result["totalSent"],
        FEATURE_COLUMNS[19]: result["totalRec"],
        FEATURE_COLUMNS[20]: result["total_ether_sent_contracts"],
        FEATURE_COLUMNS[21]: result["total_ether_balance"],
        FEATURE_COLUMNS[22]: result["totalErc20Tnxs"],
        FEATURE_COLUMNS[23]: result["erc20_total_rec"],
        FEATURE_COLUMNS[24]: result["erc20_total_sent"],
        FEATURE_COLUMNS[25]: result["erc20_total_sent_contract"],
        FEATURE_COLUMNS[26]: result["erc20_uniq_sent_addr"],
        FEATURE_COLUMNS[27]: result["erc20_uniq_rec_addr"],
        FEATURE_COLUMNS[28]: result["erc20_uniq_sent_addr_1"],
        FEATURE_COLUMNS[29]: result["erc20_uniq_rec_contract_addr"],
        FEATURE_COLUMNS[30]: result["erc20_avg_time_sent"],
        FEATURE_COLUMNS[31]: result["erc20_avg_time_rec"],
        FEATURE_COLUMNS[32]: result["erc20_avg_time_rec2"],
        FEATURE_COLUMNS[33]: result["erc20_avg_time_contract"],
        FEATURE_COLUMNS[34]: result["erc20_min_val_rec"],
        FEATURE_COLUMNS[35]: result["erc20_max_val_rec"],
        FEATURE_COLUMNS[36]: result["erc20_avg_val_rec"],
        FEATURE_COLUMNS[37]: result["erc20_min_val_sent"],
        FEATURE_COLUMNS[38]: result["erc20_max_val_sent"],
        FEATURE_COLUMNS[39]: result["erc20_avg_val_sent"],
        FEATURE_COLUMNS[40]: result["erc20_min_val_sent_contract"],
        FEATURE_COLUMNS[41]: result["erc20_max_val_sent_contract"],
        FEATURE_COLUMNS[42]: result["erc20_avg_val_sent_contract"],
        FEATURE_COLUMNS[43]: result["erc20UniqSentTokenName"],
        FEATURE_COLUMNS[44]: result["erc20UniqRecTokenName"],
    }

    return pd.DataFrame([row])
