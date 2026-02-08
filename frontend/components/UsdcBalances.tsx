"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import {
  supportedChains,
  USDC_ADDRESSES,
  ERC20_ABI,
  createChainPublicClient,
} from "@/lib/wallet";

interface ChainBalance {
  chainId: number;
  chainName: string;
  balance: number; // human-readable USDC
}

export function UsdcBalances() {
  const { address, chainId } = useWallet();
  const [balances, setBalances] = useState<ChainBalance[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!address) {
      setBalances([]);
      return;
    }
    setLoading(true);
    try {
      const results = await Promise.allSettled(
        supportedChains.map(async (chain) => {
          const client = createChainPublicClient(chain.id);
          const usdcAddr = USDC_ADDRESSES[chain.id];

          let raw: bigint;
          if (usdcAddr === null) {
            // Arc — native USDC (6 decimals)
            raw = await client.getBalance({ address: address as `0x${string}` });
          } else {
            raw = (await client.readContract({
              address: usdcAddr,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [address as `0x${string}`],
            })) as bigint;
          }
          return {
            chainId: chain.id,
            chainName: chain.name,
            balance: Number(raw) / 1e6,
          };
        }),
      );

      setBalances(
        results
          .filter((r): r is PromiseFulfilledResult<ChainBalance> => r.status === "fulfilled")
          .map((r) => r.value),
      );
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances, chainId]);

  // Periodic refresh every 30s
  useEffect(() => {
    if (!address) return;
    const iv = setInterval(fetchBalances, 30_000);
    return () => clearInterval(iv);
  }, [address, fetchBalances]);

  if (!address) return null;

  return (
    <div className="bg-[#050505] rounded-2xl border border-[#1a1a1a] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a1a1a]">
        <span className="text-[12px] text-[#555] uppercase tracking-wider">
          USDC Balances
        </span>
        <button
          onClick={fetchBalances}
          className="text-[#555] hover:text-white transition-colors cursor-pointer"
          disabled={loading}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      {balances.length > 0 ? (
        balances.map((b) => (
          <div
            key={b.chainId}
            className={`flex items-center justify-between px-5 py-3 border-b border-[#1a1a1a] last:border-b-0 ${
              b.chainId === chainId ? "bg-[#0a0a0a]" : ""
            }`}
          >
            <span className="text-[13px] text-[#999]">
              {b.chainName}
              {b.chainId === chainId && (
                <span className="ml-1.5 text-[10px] text-[#555]">active</span>
              )}
            </span>
            <span className="text-[13px] text-white font-medium">
              {b.balance.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC
            </span>
          </div>
        ))
      ) : (
        <div className="px-5 py-4 text-center text-[13px] text-[#555]">
          {loading ? "Loading..." : "No balances"}
        </div>
      )}
    </div>
  );
}
