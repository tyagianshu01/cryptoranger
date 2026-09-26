// ─── Sentinel Graph Forensics — Core Type Definitions ────────────────────────

export type NodeType =
  | 'suspect'      // root wallet under investigation
  | 'intermediate' // pass-through hop
  | 'mixer'        // privacy contract (Tornado Cash, etc.)
  | 'sybil'        // wallet in a Sybil/fraud ring
  | 'vasp'         // exchange / custodial endpoint
  | 'pool';        // liquidity pool

export type EdgeType =
  | 'peel'      // peel-chain obfuscation transfer
  | 'offramp'   // confirmed exchange deposit (cash-out)
  | 'normal';   // standard transfer

export interface WalletNode {
  id: string;
  address: string;
  label: string;
  type: NodeType;
  riskScore: number;        // 0–100
  balance: number;          // ETH equivalent
  balanceUsd: number;
  firstSeen: string;        // ISO datetime
  lastActive: string;       // ISO datetime
  ensName?: string;
  txCount: number;
  hopDepth: number;         // distance from root
  flagged: boolean;
  chain: 'ETH' | 'BTC' | 'TRX' | 'BNB';
  clusterIds?: string[];    // fraud cluster membership
  mathMetrics?: {
    degreeCentrality: number;
    logVolume: number;
    velocityPenalty: number;
    mlBase: number;
  };
}

export interface TxEdge {
  id: string;
  source: string;           // WalletNode.id
  target: string;           // WalletNode.id
  amount: number;           // ETH equivalent
  amountUsd: number;
  percent: number;          // % of source balance forwarded
  type: EdgeType;
  txHash: string;
  blockTimestamp: string;
  gasUsed?: number;
}

export interface FraudCluster {
  id: string;
  name: string;
  confidence: number;       // 0–100
  walletCount: number;
  walletIds: string[];
  type: 'peel' | 'sybil' | 'offramp' | 'mixer';
  description: string;
  modelVersion: string;
  severity: 'CRITICAL' | 'CONFIRMED' | 'FLAGGED' | 'SUSPECTED';
}

export interface VaspMatch {
  nodeId: string;
  exchange: string;
  jurisdiction: string;
  confidence: number;       // 0–100
  frozen: boolean;
  freezeAuthority?: string;
  mlLabel: string;
}

export interface PeelHop {
  hop: number;
  storePercent: number;     // % retained
  peelPercent: number;      // % forwarded
  amountEth: number;
}

export interface TraceResult {
  rootAddress: string;
  hops: number;
  nodes: WalletNode[];
  edges: TxEdge[];
  clusters: FraudCluster[];
  vaspMatches: VaspMatch[];
  riskScore: number;
  threatVector: string;
  peelChain: PeelHop[];
  totalValueTraced: number;
  totalValueUsd: number;
  assetsRestricted: number;
  assetsRestrictedUsd: number;
  mixerHopCount: number;
  traceId: string;
  jurisdiction: string;
  watchlists: string[];
  caseId: string;
  chainOfCustodyHash: string;
  ledgerTransactions: any[];
}

// ForceGraph node/link shapes (extend from WalletNode / TxEdge)
export interface FGNode extends WalletNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  __bckgDimensions?: [number, number];
}

export interface FGLink extends TxEdge {
  // react-force-graph mutates source/target to node objects at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  source: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target: any;
}
