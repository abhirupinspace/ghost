import { createPublicClient, http, type WalletClient } from "viem";
import { arcTestnet } from "viem/chains";

export const CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
    "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const GHOST_ABI = [
  {
    name: "getLenderBalance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "lender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getBorrowerCollateral",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "borrower", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getCreditScore",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getRequiredCollateral",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "borrower", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getOwed",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "loanId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "depositLend",
    type: "function",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    name: "depositCollateral",
    type: "function",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    name: "repay",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "loanId", type: "uint256" }],
    outputs: [],
  },
] as const;

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

// ── Read helpers ──

export function readLenderBalance(address: string) {
  return publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: GHOST_ABI,
    functionName: "getLenderBalance",
    args: [address as `0x${string}`],
  });
}

export function readBorrowerCollateral(address: string) {
  return publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: GHOST_ABI,
    functionName: "getBorrowerCollateral",
    args: [address as `0x${string}`],
  });
}

export function readCreditScore(address: string) {
  return publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: GHOST_ABI,
    functionName: "getCreditScore",
    args: [address as `0x${string}`],
  });
}

export function readRequiredCollateral(address: string, amount: bigint) {
  return publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: GHOST_ABI,
    functionName: "getRequiredCollateral",
    args: [address as `0x${string}`, amount],
  });
}

export function readOwed(loanId: bigint) {
  return publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: GHOST_ABI,
    functionName: "getOwed",
    args: [loanId],
  });
}

// ── Write helpers (use walletClient from WalletContext) ──

export async function writeDepositLend(
  walletClient: WalletClient,
  amountWei: bigint,
) {
  return walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: GHOST_ABI,
    functionName: "depositLend",
    args: [],
    value: amountWei,
    chain: arcTestnet,
  });
}

export async function writeDepositCollateral(
  walletClient: WalletClient,
  amountWei: bigint,
) {
  return walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: GHOST_ABI,
    functionName: "depositCollateral",
    args: [],
    value: amountWei,
    chain: arcTestnet,
  });
}

export async function writeRepay(
  walletClient: WalletClient,
  loanId: bigint,
  amountWei: bigint,
) {
  return walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: GHOST_ABI,
    functionName: "repay",
    args: [loanId],
    value: amountWei,
    chain: arcTestnet,
  });
}
