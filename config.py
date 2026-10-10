import os
from dotenv import load_dotenv

# Load environment variables from .env file
# Must be called before any Langfuse SDK import so it can auto-read the keys.
load_dotenv()

# API and Database Configurations
ETHERSCAN_API_KEY = os.getenv('ETHERSCAN_API_KEY')
SOLANA_RPC_URL = os.getenv('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com')
NEO4J_URI = os.getenv('NEO4J_URI', 'neo4j://127.0.0.1:7687')
NEO4J_USER = os.getenv('NEO4J_USER', 'neo4j')
NEO4J_PASSWORD = os.getenv('NEO4J_PASSWORD')

# ── Langfuse Observability ─────────────────────────────────────────────────
# The SDK auto-reads these three variables; they are listed here for clarity.
# LANGFUSE_SECRET_KEY  = os.getenv('LANGFUSE_SECRET_KEY')   # sk-lf-...
# LANGFUSE_PUBLIC_KEY  = os.getenv('LANGFUSE_PUBLIC_KEY')   # pk-lf-...
# LANGFUSE_HOST        = os.getenv('LANGFUSE_HOST', 'https://cloud.langfuse.com')

# Known exchanges (VASPs) you want to trace funds to (Ethereum)
KNOWN_VASPS = [
    "0x28c6c06298d514db089934071355e5743bf21d60", # Example Binance Hot Wallet
    "0x56eddb7aa87536c09ccc2793473599fd21a8b17f"  # Example VASP
]

# Solana Exchange Deposit / Hot Wallets (Base58, case-sensitive)
SOLANA_KNOWN_VASPS = {
    "5tzFkiKscBizbkAmanjhNgqiLNbMrnsKPdMWv63BBjHY": "Binance 1",
    "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM": "Binance 2",
    "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS": "Coinbase 1",
    "GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPgv7npb": "Coinbase 2",
    "FWznbcNXWQuHTawe9RxvQ2LdJF2YmtV3tuZnGL3S7TWb": "Kraken 1",
    "AC5RDfQFmDS1deWZos921qbhirGLTgFgBDDmA9UULyHg": "Bybit 1",
    "6FEVkH17P9y8Q9aC99dKEvUvBxfNn44LoqEzgup88P4n": "OKX 1",
}

# Solana System/DEX Programs to EXCLUDE from BFS traversal
# Following these would cause infinite loops (they appear in every transaction)
SOLANA_EXCLUDED_ACCOUNTS = {
    "11111111111111111111111111111111",               # System Program
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",   # Token Program
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",   # Token-2022 Program
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",   # Associated Token Account Program
    "ComputeBudget111111111111111111111111111111",     # Compute Budget Program
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",   # Jupiter v6
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",   # Orca Whirlpool
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",  # Raydium AMM
}