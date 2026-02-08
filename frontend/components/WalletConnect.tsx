"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import {
  supportedChains,
  USDC_ADDRESSES,
  ERC20_ABI,
  createChainPublicClient,
} from "@/lib/wallet";
import { arcTestnet } from "viem/chains";

function truncAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const USDC_LOGO = "https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png";

function tokenSymbol(chainId: number) {
  return chainId === arcTestnet.id ? "USD" : "USDC";
}

const CHAIN_LOGOS: Record<number, string> = {
  [arcTestnet.id]: "/arc.png",
  84532: "https://s2.coinmarketcap.com/static/img/coins/64x64/9195.png", // Base
  421614: "https://s2.coinmarketcap.com/static/img/coins/64x64/11841.png", // Arbitrum
};

function ChainIcon({ chainId, size = 18 }: { chainId: number; size?: number }) {
  const [err, setErr] = useState(false);
  const src = CHAIN_LOGOS[chainId];
  if (!src || err) {
    return (
      <div
        className="rounded-full bg-[#222] flex items-center justify-center text-[10px] font-bold text-white shrink-0"
        style={{ width: size, height: size }}
      >
        A
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="rounded-full shrink-0"
      onError={() => setErr(true)}
    />
  );
}

interface ChainBalance {
  chainId: number;
  balance: number;
}

export function WalletConnect() {
  const { address, chainId, connect, disconnect, switchChain } = useWallet();
  const [open, setOpen] = useState(false);
  const [balances, setBalances] = useState<ChainBalance[]>([]);
  const [loadingBal, setLoadingBal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch USDC balances across all chains
  const fetchBalances = useCallback(async () => {
    if (!address) { setBalances([]); return; }
    setLoadingBal(true);
    try {
      const results = await Promise.allSettled(
        supportedChains.map(async (chain) => {
          const client = createChainPublicClient(chain.id);
          const usdcAddr = USDC_ADDRESSES[chain.id];
          let raw: bigint;
          if (usdcAddr === null) {
            raw = await client.getBalance({ address: address as `0x${string}` });
          } else {
            raw = (await client.readContract({
              address: usdcAddr,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [address as `0x${string}`],
            })) as bigint;
          }
          return { chainId: chain.id, balance: Number(raw) / 1e6 };
        }),
      );
      setBalances(
        results
          .filter((r): r is PromiseFulfilledResult<ChainBalance> => r.status === "fulfilled")
          .map((r) => r.value),
      );
    } catch {} finally { setLoadingBal(false); }
  }, [address]);

  // Refetch on connect + chain switch + every 30s
  useEffect(() => { fetchBalances(); }, [fetchBalances, chainId]);
  useEffect(() => {
    if (!address) return;
    const iv = setInterval(fetchBalances, 30_000);
    return () => clearInterval(iv);
  }, [address, fetchBalances]);

  if (!address) {
    return (
      <button
        onClick={connect}
        className="px-4 py-2 bg-white text-[#111] text-[13px] font-semibold rounded-xl hover:brightness-110 transition-all cursor-pointer"
      >
        Connect Wallet
      </button>
    );
  }

  const currentChain = supportedChains.find((c) => c.id === chainId);
  const activeBalance = balances.find((b) => b.chainId === chainId);

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      {/* USDC balance for active chain */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-[#111] border border-[#1a1a1a] rounded-xl text-[12px]">
        <img src={USDC_LOGO} alt="USDC" width={16} height={16} className="rounded-full shrink-0" />
        {loadingBal ? (
          <Loader2 size={12} className="animate-spin text-[#555]" />
        ) : (
          <span className="text-white font-medium">
            {activeBalance ? activeBalance.balance.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "0"}{" "}
            <span className="text-[#555]">{tokenSymbol(chainId)}</span>
          </span>
        )}
      </div>

      {/* Chain selector */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 bg-[#111] border border-[#222] rounded-xl text-[12px] text-[#999] hover:border-[#333] transition-colors cursor-pointer"
      >
        <ChainIcon chainId={chainId} size={18} />
        <span className="text-white font-medium">
          {currentChain?.name ?? `Chain ${chainId}`}
        </span>
        <ChevronDown size={12} />
      </button>

      {/* Address + disconnect */}
      <button
        onClick={disconnect}
        className="px-3 py-2 bg-[#111] border border-[#222] rounded-xl text-[12px] text-white font-mono hover:border-[#333] transition-colors cursor-pointer"
        title="Disconnect"
      >
        {truncAddr(address)}
      </button>

      {/* Chain dropdown with balances */}
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-[#0a0a0a] border border-[#222] rounded-xl overflow-hidden min-w-[240px] z-50">
          {supportedChains.map((chain) => {
            const bal = balances.find((b) => b.chainId === chain.id);
            return (
              <button
                key={chain.id}
                onClick={() => { switchChain(chain.id); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 text-left px-4 py-2.5 text-[12px] transition-colors cursor-pointer ${
                  chain.id === chainId
                    ? "text-white bg-[#111]"
                    : "text-[#888] hover:text-white hover:bg-[#111]"
                }`}
              >
                <ChainIcon chainId={chain.id} size={20} />
                <span className="flex-1">{chain.name}</span>
                <span className="text-[11px] text-[#666] font-mono">
                  {bal ? bal.balance.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
