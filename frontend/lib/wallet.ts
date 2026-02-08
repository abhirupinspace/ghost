import { createPublicClient, http } from "viem";
import { arbitrumSepolia, arcTestnet, baseSepolia } from "viem/chains";

export const supportedChains = [
  arcTestnet,
  baseSepolia,
  arbitrumSepolia,
] as const;

export const USDC_ADDRESSES: Record<number, `0x${string}` | null> = {
  [arcTestnet.id]: "0x3600000000000000000000000000000000000000",
  [baseSepolia.id]: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  [arbitrumSepolia.id]: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
};

// ── Public clients per chain ──

export function createChainPublicClient(chainId: number) {
  const chain = supportedChains.find((c) => c.id === chainId);
  if (!chain) throw new Error(`Unsupported chain: ${chainId}`);
  return createPublicClient({ chain, transport: http() });
}

// ── ERC-20 minimal ABI ──

export const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
