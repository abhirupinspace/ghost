"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Wallet,
  BarChart3,
  Clock,
  Loader2,
} from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import { DotPattern } from "@/components/ui/dot-pattern";
import { CryptoIcon } from "@/components/CryptoIcon";
import { TrancheToggle } from "@/components/TrancheToggle";
import {
  getMockMarkets,
  fmtUsd,
  type Tranche,
  type LendPosition,
} from "@/lib/ghost-data";
import { fetchUserLends, submitLendIntent, type UserLends } from "@/lib/api";
import { readLenderBalance, writeDepositLend } from "@/lib/contract";
import {
  pageVariants,
  pageTransition,
  staggerContainer,
  staggerChild,
  expandVariants,
  expandTransition,
  tabPanel,
  tabTransition,
  buttonTap,
} from "@/lib/motion";

const markets = getMockMarkets();

function fmtRate(n: number): string {
  return `${n.toFixed(1)}%`;
}

// USDC has 6 decimals on Arc
function parseUsdc(amount: number): bigint {
  return BigInt(Math.floor(amount * 1e6));
}

function formatUsdc(wei: bigint | string): number {
  return Number(BigInt(wei)) / 1e6;
}

export default function LendPage() {
  const { address, walletClient } = useWallet();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedTab, setExpandedTab] = useState<"bid" | "positions">("bid");
  const [tranche, setTranche] = useState<Tranche>("senior");
  const [minRate, setMinRate] = useState("");
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState(90);
  const [submitting, setSubmitting] = useState(false);

  // Live data
  const [onChainBalance, setOnChainBalance] = useState<number>(0);
  const [userLends, setUserLends] = useState<UserLends | null>(null);
  const [positions, setPositions] = useState<LendPosition[]>([]);


  const loadData = useCallback(async () => {
    if (!address) return;
    try {
      const [lends, bal] = await Promise.allSettled([
        fetchUserLends(address),
        readLenderBalance(address),
      ]);
      if (lends.status === "fulfilled") {
        setUserLends(lends.value);
        // Map API intents to LendPosition shape for display
        const mapped: LendPosition[] = lends.value.activeIntents.map(
          (i, idx) => ({
            id: `intent-${i.id}`,
            market: "usdc-market",
            tranche: (i.tranche as Tranche) || "senior",
            amount: Number(i.amount),
            rate: i.minRate ?? 0,
            duration: i.duration,
            status: "pending" as const,
            earnings: 0,
            epoch: 0,
          }),
        );
        // Add lender positions from matched loans
        const posFromLoans: LendPosition[] = lends.value.positions.map(
          (p, idx) => ({
            id: `pos-${p.loanId}`,
            market: "usdc-market",
            tranche: (p.tranche as Tranche) || "senior",
            amount: Number(p.amount),
            rate: 0,
            duration: 0,
            status: "matched" as const,
            earnings: 0,
            epoch: 0,
          }),
        );
        setPositions([...posFromLoans, ...mapped]);
      }
      if (bal.status === "fulfilled") {
        setOnChainBalance(formatUsdc(bal.value));
      }
    } catch {
      // Server/contract down — use zero state
    }
  }, [address]);

  useEffect(() => {
    loadData();
    const iv = setInterval(loadData, 15_000);
    return () => clearInterval(iv);
  }, [loadData]);

  const totalLent = positions.reduce((s, p) => s + p.amount, 0);
  const totalEarnings = positions.reduce((s, p) => s + p.earnings, 0);
  const activeBids = positions.filter((p) => p.status === "pending").length;
  const avgApy =
    totalLent > 0
      ? positions.reduce((s, p) => s + p.rate * (p.amount / totalLent), 0)
      : 0;

  const handleToggle = (id: string) => {
    if (expanded === id) {
      setExpanded(null);
    } else {
      setExpanded(id);
      setExpandedTab("bid");
      setTranche("senior");
      setMinRate("");
      setAmount("");
    }
  };

  const handleNum = (setter: (v: string) => void) => (value: string) => {
    if (value === "" || /^\d*\.?\d*$/.test(value)) setter(value);
  };

  const currentMarket = expanded
    ? markets.find((m) => m.id === expanded)
    : null;
  const selectedRate =
    tranche === "senior"
      ? (currentMarket?.seniorRate ?? 4)
      : (currentMarket?.juniorRate ?? 8);
  const parsedAmount = parseFloat(amount) || 0;
  const parsedRate = parseFloat(minRate) || selectedRate;
  const expectedEarnings = (parsedAmount * parsedRate * duration) / (365 * 100);

  const handleSubmitBid = async () => {
    if (!walletClient || !address || parsedAmount <= 0) return;
    setSubmitting(true);
    try {
      // 1. Deposit on-chain
      await writeDepositLend(walletClient, parseUsdc(parsedAmount));
      // 2. Submit intent to server
      await submitLendIntent({
        address,
        amount: parsedAmount,
        duration,
        minRate: parsedRate,
        tranche,
      });
      // Reset & refresh
      setAmount("");
      setMinRate("");
      await loadData();
    } catch (e) {
      console.error("Submit bid failed:", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="min-h-screen relative overflow-hidden font-sans"
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      transition={pageTransition}
    >
      <DotPattern
        cr={1.2}
        width={24}
        height={24}
        className="z-0 text-[#333] [mask-image:radial-gradient(ellipse_at_center,white,transparent_80%)]"
      />

      <div className="relative z-10 max-w-[920px] mx-auto px-6 pt-6 pb-10">
        <h1 className="text-[28px] font-semibold text-white mb-6">Lend</h1>

        {/* Overview stats */}
        <motion.div
          className="grid grid-cols-4 gap-3 mb-6"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {[
            {
              label: "Total Lent",
              value: fmtUsd(totalLent),
              icon: <Wallet size={14} className="text-white" />,
              color: "text-white",
            },
            {
              label: "Earnings",
              value: fmtUsd(totalEarnings),
              icon: <TrendingUp size={14} className="text-[#d4d4d4]" />,
              color: "text-[#d4d4d4]",
            },
            {
              label: "Avg APY",
              value: avgApy > 0 ? fmtRate(avgApy) : "—",
              icon: <BarChart3 size={14} className="text-white" />,
              color: "text-white",
            },
            {
              label: "Active Bids",
              value: `${activeBids}`,
              icon: <Clock size={14} className="text-[#666]" />,
              color: "text-white",
            },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              variants={staggerChild}
              className="bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a] p-4"
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                {stat.icon}
                <span className="text-[12px] text-[#555]">{stat.label}</span>
              </div>
              <div className={`text-[20px] font-semibold ${stat.color}`}>
                {stat.value}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Market cards */}
        <div className="flex flex-col gap-3">
          {markets.map((market) => {
            const isOpen = expanded === market.id;
            const marketPositions = positions.filter(
              (p) => p.market === market.id,
            );

            return (
              <div
                key={market.id}
                className={`bg-[#0a0a0a] rounded-2xl border transition-colors ${
                  isOpen ? "border-[#222222]" : "border-[#1a1a1a]"
                }`}
              >
                {/* Summary row */}
                <button
                  onClick={() => handleToggle(market.id)}
                  className="w-full flex items-center gap-4 p-5 cursor-pointer"
                >
                  <CryptoIcon id={market.asset} size={40} />

                  <div className="flex-1 text-left">
                    <div className="text-[15px] font-medium text-white">
                      {market.symbol} Market
                    </div>
                    <div className="text-[11px] text-[#555]">
                      {address
                        ? `Balance: ${onChainBalance.toLocaleString()} USDC`
                        : "Connect wallet"}
                    </div>
                  </div>

                  <div className="text-right mr-3">
                    <div className="text-[14px] font-medium text-[#d4d4d4]">
                      {fmtRate(market.seniorRate)}
                    </div>
                    <div className="text-[11px] text-[#555]">Senior</div>
                  </div>

                  <div className="text-right mr-4">
                    <div className="text-[14px] font-medium text-[#888888]">
                      {fmtRate(market.juniorRate)}
                    </div>
                    <div className="text-[11px] text-[#555]">Junior</div>
                  </div>

                  {isOpen ? (
                    <ChevronUp size={18} className="text-[#555]" />
                  ) : (
                    <ChevronDown size={18} className="text-[#555]" />
                  )}
                </button>

                {/* Expanded panel */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      className="overflow-hidden"
                      variants={expandVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      transition={expandTransition}
                    >
                      <div className="px-5 pb-5">
                        <div className="border-t border-[#1a1a1a] pt-5">
                          {/* Tab toggle */}
                          <div className="grid grid-cols-2 gap-2 mb-5 max-w-[300px]">
                            <button
                              onClick={() => setExpandedTab("bid")}
                              className={`py-2 rounded-xl text-[13px] font-semibold transition-colors cursor-pointer ${
                                expandedTab === "bid"
                                  ? "bg-white text-[#111]"
                                  : "bg-[#050505] text-[#555] border border-[#1a1a1a]"
                              }`}
                            >
                              Place Bid
                            </button>
                            <button
                              onClick={() => setExpandedTab("positions")}
                              className={`py-2 rounded-xl text-[13px] font-semibold transition-colors cursor-pointer ${
                                expandedTab === "positions"
                                  ? "bg-[#111111] text-white border border-[#222222]"
                                  : "bg-[#050505] text-[#555] border border-[#1a1a1a]"
                              }`}
                            >
                              Your Positions
                            </button>
                          </div>

                          <AnimatePresence mode="wait">
                            {expandedTab === "bid" ? (
                              <motion.div
                                key="bid"
                                variants={tabPanel}
                                initial="hidden"
                                animate="visible"
                                exit="exit"
                                transition={tabTransition}
                                className="grid grid-cols-[1fr_260px] gap-5"
                              >
                                {/* Left — bid form */}
                                <div>
                                  {/* Tranche */}
                                  <div className="mb-4">
                                    <label className="text-[12px] text-[#666] mb-1.5 block">
                                      Tranche
                                    </label>
                                    <TrancheToggle
                                      selected={tranche}
                                      onChange={setTranche}
                                      seniorRate={market.seniorRate}
                                      juniorRate={market.juniorRate}
                                    />
                                  </div>

                                  {/* Min rate */}
                                  <div className="mb-4">
                                    <label className="text-[12px] text-[#666] mb-1.5 block">
                                      Min Rate (%)
                                    </label>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      placeholder={selectedRate.toFixed(1)}
                                      value={minRate}
                                      onChange={(e) =>
                                        handleNum(setMinRate)(e.target.value)
                                      }
                                      className="w-full px-3.5 py-2.5 bg-[#050505] rounded-xl border border-[#1a1a1a] text-[14px] text-white placeholder:text-[#444] outline-none focus:border-[#222222]"
                                    />
                                  </div>

                                  {/* Amount */}
                                  <div className="mb-2">
                                    <div className="flex items-center justify-between mb-1.5">
                                      <label className="text-[12px] text-[#666]">
                                        Amount ({market.symbol})
                                      </label>
                                      <span className="text-[12px] text-[#888]">
                                        Available:{" "}
                                        {onChainBalance.toLocaleString()}{" "}
                                        {market.symbol}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="0.00"
                                        value={amount}
                                        onChange={(e) =>
                                          handleNum(setAmount)(e.target.value)
                                        }
                                        className="flex-1 px-3.5 py-2.5 bg-[#050505] rounded-xl border border-[#1a1a1a] text-[14px] text-white placeholder:text-[#444] outline-none focus:border-[#222222]"
                                      />
                                      <button
                                        onClick={() =>
                                          setAmount(onChainBalance.toString())
                                        }
                                        className="px-3 py-2.5 bg-[#050505] rounded-xl border border-[#1a1a1a] text-[12px] text-white font-semibold cursor-pointer hover:border-[#222222] transition-colors"
                                      >
                                        MAX
                                      </button>
                                    </div>
                                  </div>

                                  {/* % shortcuts */}
                                  <div className="flex items-center gap-2 mb-4">
                                    {[25, 50, 75, 100].map((pct) => (
                                      <button
                                        key={pct}
                                        onClick={() =>
                                          setAmount(
                                            (
                                              (onChainBalance * pct) /
                                              100
                                            ).toFixed(0),
                                          )
                                        }
                                        className="flex-1 py-1 text-[11px] text-[#666] bg-[#050505] rounded-lg border border-[#1a1a1a] hover:text-[#999] hover:border-[#222222] transition-colors cursor-pointer"
                                      >
                                        {pct}%
                                      </button>
                                    ))}
                                  </div>

                                  {/* Duration */}
                                  <div className="mb-4">
                                    <label className="text-[12px] text-[#666] mb-1.5 block">
                                      Duration
                                    </label>
                                    <div className="flex items-center gap-2">
                                      {[30, 90, 180, 365].map((d) => (
                                        <button
                                          key={d}
                                          onClick={() => setDuration(d)}
                                          className={`flex-1 py-2 text-[12px] font-medium rounded-lg border transition-colors cursor-pointer ${
                                            duration === d
                                              ? "bg-[#111111] text-white border-[#222222]"
                                              : "bg-[#050505] text-[#555] border-[#1a1a1a] hover:text-[#999]"
                                          }`}
                                        >
                                          {d}d
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* CTA */}
                                  <motion.button
                                    whileTap={buttonTap}
                                    onClick={handleSubmitBid}
                                    disabled={
                                      !walletClient ||
                                      submitting ||
                                      parsedAmount <= 0
                                    }
                                    className="w-full py-3 rounded-xl text-[14px] font-semibold cursor-pointer bg-white text-[#111] hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                  >
                                    {submitting && (
                                      <Loader2
                                        size={14}
                                        className="animate-spin"
                                      />
                                    )}
                                    {!walletClient
                                      ? "Connect Wallet"
                                      : submitting
                                        ? "Submitting..."
                                        : "Submit Bid"}
                                  </motion.button>
                                </div>

                                {/* Right — summary */}
                                <div className="flex flex-col gap-3">
                                  <div className="bg-[#050505] rounded-xl border border-[#1a1a1a] p-3.5">
                                    <div className="text-[12px] text-[#999] mb-2">
                                      Bid Summary
                                    </div>
                                    {[
                                      {
                                        label: "Tranche",
                                        value:
                                          tranche === "senior"
                                            ? "Senior (70%)"
                                            : "Junior (30%)",
                                        cls:
                                          tranche === "senior"
                                            ? "text-[#d4d4d4]"
                                            : "text-[#888888]",
                                      },
                                      {
                                        label: "Min Rate",
                                        value: `${parsedRate.toFixed(1)}%`,
                                        cls: "text-white",
                                      },
                                      {
                                        label: "Amount",
                                        value:
                                          parsedAmount > 0
                                            ? `${parsedAmount.toLocaleString()} ${market.symbol}`
                                            : "—",
                                        cls: "text-white",
                                      },
                                      {
                                        label: "Duration",
                                        value: `${duration} days`,
                                        cls: "text-white",
                                      },
                                      {
                                        label: "Expected Earnings",
                                        value:
                                          expectedEarnings > 0
                                            ? fmtUsd(expectedEarnings)
                                            : "—",
                                        cls: "text-[#d4d4d4]",
                                      },
                                    ].map((row) => (
                                      <div
                                        key={row.label}
                                        className="flex items-center justify-between py-1"
                                      >
                                        <span className="text-[12px] text-[#666]">
                                          {row.label}
                                        </span>
                                        <span
                                          className={`text-[12px] font-medium ${row.cls}`}
                                        >
                                          {row.value}
                                        </span>
                                      </div>
                                    ))}
                                  </div>

                                  <div className="bg-[#050505] rounded-xl border border-[#1a1a1a] p-3.5">
                                    <div className="text-[12px] text-[#999] mb-2">
                                      Market Info
                                    </div>
                                    {[
                                      {
                                        label: "Senior Rate",
                                        value: fmtRate(market.seniorRate),
                                        cls: "text-[#d4d4d4]",
                                      },
                                      {
                                        label: "Junior Rate",
                                        value: fmtRate(market.juniorRate),
                                        cls: "text-[#888888]",
                                      },
                                      {
                                        label: "Utilization",
                                        value: `${market.utilization}%`,
                                        cls: "text-white",
                                      },
                                    ].map((row) => (
                                      <div
                                        key={row.label}
                                        className="flex items-center justify-between py-1"
                                      >
                                        <span className="text-[12px] text-[#666]">
                                          {row.label}
                                        </span>
                                        <span
                                          className={`text-[12px] font-medium ${row.cls}`}
                                        >
                                          {row.value}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </motion.div>
                            ) : (
                              /* Positions */
                              <motion.div
                                key="positions"
                                variants={tabPanel}
                                initial="hidden"
                                animate="visible"
                                exit="exit"
                                transition={tabTransition}
                              >
                                {!address ? (
                                  <div className="text-center py-8 text-[#555] text-[14px]">
                                    Connect wallet to view positions
                                  </div>
                                ) : marketPositions.length > 0 ? (
                                  <div className="bg-[#050505] rounded-xl border border-[#1a1a1a] overflow-hidden">
                                    <div className="grid grid-cols-[80px_100px_80px_80px_100px_80px] items-center px-4 py-3 border-b border-[#1a1a1a] text-[11px] text-[#555] uppercase tracking-wider">
                                      <span>Tranche</span>
                                      <span className="text-right">Amount</span>
                                      <span className="text-right">Rate</span>
                                      <span className="text-right">
                                        Duration
                                      </span>
                                      <span className="text-right">
                                        Earnings
                                      </span>
                                      <span className="text-right">Status</span>
                                    </div>
                                    {marketPositions.map((pos) => (
                                      <div
                                        key={pos.id}
                                        className="grid grid-cols-[80px_100px_80px_80px_100px_80px] items-center px-4 py-3 border-b border-[#1a1a1a] last:border-b-0"
                                      >
                                        <span
                                          className={`text-[12px] font-medium ${pos.tranche === "senior" ? "text-[#d4d4d4]" : "text-[#888888]"}`}
                                        >
                                          {pos.tranche === "senior"
                                            ? "Senior"
                                            : "Junior"}
                                        </span>
                                        <span className="text-[12px] text-white text-right">
                                          {pos.amount.toLocaleString()}
                                        </span>
                                        <span className="text-[12px] text-white text-right">
                                          {pos.rate > 0 ? `${pos.rate}%` : "—"}
                                        </span>
                                        <span className="text-[12px] text-[#666] text-right">
                                          {pos.duration > 0
                                            ? `${pos.duration}d`
                                            : "—"}
                                        </span>
                                        <span className="text-[12px] text-[#d4d4d4] text-right">
                                          {pos.earnings > 0
                                            ? fmtUsd(pos.earnings)
                                            : "—"}
                                        </span>
                                        <span className="text-right">
                                          <span
                                            className={`text-[11px] px-2 py-0.5 rounded-full ${
                                              pos.status === "matched"
                                                ? "bg-[#d4d4d4]/10 text-[#d4d4d4]"
                                                : pos.status === "active"
                                                  ? "bg-white/10 text-white"
                                                  : "bg-[#333]/30 text-[#666]"
                                            }`}
                                          >
                                            {pos.status}
                                          </span>
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-center py-8 text-[#555] text-[14px]">
                                    No positions in this market
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
