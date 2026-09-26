import requests
from config import ETHERSCAN_API_KEY


def _call_etherscan(address, action, offset=100):
    """Internal helper that hits a single Etherscan endpoint."""
    url = "https://api.etherscan.io/api"
    params = {
        "module": "account",
        "action": action,
        "address": address,
        "startblock": 0,
        "endblock": 99999999,
        "page": 1,
        "offset": offset,
        "sort": "desc",
        "apikey": ETHERSCAN_API_KEY
    }
    try:
        response = requests.get(url, params=params, timeout=10)
    except Exception as e:
        print(f"Etherscan Network Error: {e}")
        return []
    
    if response.status_code != 200:
        return []
    data = response.json()
    if data.get("status") != "1":
        return []
    return data["result"]


def fetch_transactions(address, limit=100):
    """Fetches both Normal and ERC20 token transactions for a wallet."""
    print(f"Fetching Normal + ERC20 data from Etherscan for: {address}")

    normal_txs = _call_etherscan(address, "txlist", offset=limit)
    erc20_txs = _call_etherscan(address, "tokentx", offset=limit)

    print(f"  Retrieved {len(normal_txs)} normal and {len(erc20_txs)} ERC20 transactions.")
    return {"normal": normal_txs, "erc20": erc20_txs}