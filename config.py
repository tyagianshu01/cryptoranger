import os
from dotenv import load_dotenv

# Load environment variables from .env file
# Must be called before any Langfuse SDK import so it can auto-read the keys.
load_dotenv()

# API and Database Configurations
ETHERSCAN_API_KEY = os.getenv('ETHERSCAN_API_KEY')
NEO4J_URI = os.getenv('NEO4J_URI', 'neo4j://127.0.0.1:7687')
NEO4J_USER = os.getenv('NEO4J_USER', 'neo4j')
NEO4J_PASSWORD = os.getenv('NEO4J_PASSWORD')

# ── Langfuse Observability ─────────────────────────────────────────────────
# The SDK auto-reads these three variables; they are listed here for clarity.
# LANGFUSE_SECRET_KEY  = os.getenv('LANGFUSE_SECRET_KEY')   # sk-lf-...
# LANGFUSE_PUBLIC_KEY  = os.getenv('LANGFUSE_PUBLIC_KEY')   # pk-lf-...
# LANGFUSE_HOST        = os.getenv('LANGFUSE_HOST', 'https://cloud.langfuse.com')

# Known exchanges (VASPs) you want to trace funds to
KNOWN_VASPS = [
    "0x28c6c06298d514db089934071355e5743bf21d60", # Example Binance Hot Wallet
    "0x56eddb7aa87536c09ccc2793473599fd21a8b17f"  # Example VASP
]