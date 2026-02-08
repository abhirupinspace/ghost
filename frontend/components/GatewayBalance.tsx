"use client";

import { RefreshCw } from "lucide-react";
import { useGateway } from "@/contexts/GatewayContext";
import { useWallet } from "@/contexts/WalletContext";
import { fmtUsd } from "@/lib/ghost-data";

export function GatewayBalance() {
  const { address } = useWallet();
  const { balances, totalBalance, loading, refresh } = useGateway();

  if (!address) return null;

  return (
    <div className="bg-[#050505] rounded-2xl border border-[#1a1a1a] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a1a1a]">
        <span className="text-[12px] text-[#555] uppercase tracking-wider">
          Gateway USDC Balance
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[14px] font-medium text-white">
            {fmtUsd(totalBalance)}
          </span>
          <button
            onClick={refresh}
            className="text-[#555] hover:text-white transition-colors cursor-pointer"
            disabled={loading}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      {balances.length > 0 ? (
        balances
          .filter((b) => parseFloat(b.balance) > 0)
          .map((b) => (
            <div
              key={b.domain}
              className="flex items-center justify-between px-5 py-3 border-b border-[#1a1a1a] last:border-b-0"
            >
              <span className="text-[13px] text-[#999]">{b.chainName}</span>
              <span className="text-[13px] text-white font-medium">
                {parseFloat(b.balance).toLocaleString("en-US", {
                  maximumFractionDigits: 2,
                })}{" "}
                USDC
              </span>
            </div>
          ))
      ) : (
        <div className="px-5 py-4 text-center text-[13px] text-[#555]">
          {loading ? "Loading..." : "No Gateway deposits yet"}
        </div>
      )}
    </div>
  );
}
