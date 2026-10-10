import requests
from config import ETHERSCAN_API_KEY


def _call_etherscan(address, action, offset=100):
    """Fetch one account action from Etherscan API V2."""
    url = "https://api.etherscan.io/v2/api"
    params = {
        "chainid": 1,  # Ethereum mainnet
        "module": "account",
        "action": action,
        "address": address,
        "startblock": 0,
        "endblock": 99999999,
        "page": 1,
        "offset": offset,
        "sort": "desc",
        "apikey": ETHERSCAN_API_KEY,
    }

    try:
        response = requests.get(url, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as e:
        print(f"Etherscan network error: {e}")
        return []
    except ValueError as e:
        print(f"Etherscan returned invalid JSON: {e}")
        return []

    if data.get("status") == "1":
        result = data.get("result", [])
        return result if isinstance(result, list) else []

    # Etherscan reports an empty transaction list as status 0.
    message = str(data.get("result", data.get("message", "")))
    if "no transactions found" in message.lower():
        return []

    print(
        f"Etherscan API error for {address}: "
        f"{data.get('message')} - {data.get('result')}"
    )
    return []


def fetch_transactions(address, limit=100):
    """Fetch normal Ethereum and ERC-20 transactions for a wallet."""
    print(f"Fetching normal + ERC-20 data from Etherscan for: {address}")

    normal_txs = _call_etherscan(address, "txlist", offset=limit)
    erc20_txs = _call_etherscan(address, "tokentx", offset=limit)

    print(
        f"  Retrieved {len(normal_txs)} normal and "
        f"{len(erc20_txs)} ERC-20 transactions."
    )
    return {"normal": normal_txs, "erc20": erc20_txs}