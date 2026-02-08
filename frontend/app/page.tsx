"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "motion/react";
import {
  Wallet,
  Clock,
  DollarSign,
  RefreshCw,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import { useGateway } from "@/contexts/GatewayContext";
import { DotPattern } from "@/components/ui/dot-pattern";
import { TrancheToggle } from "@/components/TrancheToggle";
import { ChainIcon } from "@/components/ChainIcon";
import { fmtUsd, type Tranche } from "@/lib/ghost-data";
import {
  fetchOrderbook,
  fetchMarketStats,
  fetchUserLends,
  submitLendIntent,
  type Orderbook,
  type MarketStats,
  type UserLends,
} from "@/lib/api";
import { readLenderBalance, writeDepositLend } from "@/lib/contract";
import {
  depositableChains,
  gatewayChains,
  type ChainConfig,
} from "@/lib/gateway-contracts";
import { USDC_LOGO } from "@/lib/wallet";
import {
  pageVariants,
  pageTransition,
  staggerContainer,
  staggerChild,
  fadeInUp,
  tableContainer,
  tableRow,
  buttonTap,
} from "@/lib/motion";
import { parseEther, formatEther } from "viem";

function truncAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

export default function LendPage() {
  const { address, walletClient } = useWallet();
  const {
    balances,
    totalBalance,
    loading: gwLoading,
    depositing,
    depositStatus,
    refresh: refreshGateway,
    approveAndDeposit,
  } = useGateway();

  // Form state
  const [tranche, setTranche] = useState<Tranche>("senior");
  const [minRate, setMinRate] = useState("");
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState(90);
  const [submitting, setSubmitting] = useState(false);

  // Gateway deposit form
  const defaultChain =
    depositableChains.find((c) => c.domain === 6) ?? depositableChains[0];
  const [selectedChain, setSelectedChain] = useState<ChainConfig>(defaultChain);
  const [depositAmount, setDepositAmount] = useState("");
  const [chainDropOpen, setChainDropOpen] = useState(false);
  const chainDropRef = useRef<HTMLDivElement>(null);

  // Live data
  const [onChainBalance, setOnChainBalance] = useState(0);
  const [orderbook, setOrderbook] = useState<Orderbook | null>(null);
  const [marketStats, setMarketStats] = useState<MarketStats | null>(null);
  const [userLends, setUserLends] = useState<UserLends | null>(null);

  const loadUserData = useCallback(async () => {
    if (!address) return;
    try {
      const [lends, bal] = await Promise.allSettled([
        fetchUserLends(address),
        readLenderBalance(address),
      ]);
      if (lends.status === "fulfilled") setUserLends(lends.value);
      if (bal.status === "fulfilled") setOnChainBalance(Number(formatEther(bal.value)));
    } catch {}
  }, [address]);

  const loadOrderbook = useCallback(async () => {
    try {
      const ob = await fetchOrderbook();
      setOrderbook(ob);
    } catch {}
  }, []);

  useEffect(() => {
    fetchMarketStats()
      .then(setMarketStats)
      .catch(() => {});
    loadOrderbook();
    loadUserData();
  }, [loadOrderbook, loadUserData]);

  // Orderbook polling — 5s
  useEffect(() => {
    const iv = setInterval(loadOrderbook, 5_000);
    return () => clearInterval(iv);
  }, [loadOrderbook]);

  // User data polling — 15s
  useEffect(() => {
    const iv = setInterval(loadUserData, 15_000);
    return () => clearInterval(iv);
  }, [loadUserData]);

  // Close chain dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        chainDropRef.current &&
        !chainDropRef.current.contains(e.target as Node)
      )
        setChainDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const totalLent = marketStats?.lendSupply.total ?? "0";
  const activeBids = userLends?.activeIntents.length ?? 0;

  const parsedAmount = parseFloat(amount) || 0;
  const parsedRate = parseFloat(minRate) || 5;
  const expectedEarnings = (parsedAmount * parsedRate * duration) / (365 * 100);

  const handleNum = (setter: (v: string) => void) => (value: string) => {
    if (value === "" || /^\d*\.?\d*$/.test(value)) setter(value);
  };

  const handleSubmitBid = async () => {
    if (!walletClient || !address || parsedAmount <= 0) return;
    setSubmitting(true);
    try {
      await writeDepositLend(walletClient, parseEther(parsedAmount.toString()));
      await submitLendIntent({
        address,
        amount: parseEther(parsedAmount.toString()).toString(),
        duration,
        minRate: parsedRate,
        tranche,
      });
      setAmount("");
      setMinRate("");
      await loadUserData();
    } catch (e) {
      console.error("Submit bid failed:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGatewayDeposit = async () => {
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) return;
    try {
      await approveAndDeposit(selectedChain.chainId, BigInt(Math.floor(amt * 1e6)));
      setDepositAmount("");
    } catch (e) {
      console.error("Gateway deposit failed:", e);
    }
  };

  const activeIntents = userLends?.activeIntents ?? [];
  const matchedPositions = userLends?.positions ?? [];

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

        {/* Stats */}
        <motion.div
          className="grid grid-cols-3 gap-3 mb-6"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {[
            {
              label: "Total Lent",
              value: fmtUsd(Number(formatEther(BigInt(totalLent || 0)))),
              icon: <DollarSign size={14} className="text-white" />,
            },
            {
              label: "On-Chain Balance",
              value: `${onChainBalance.toLocaleString()} USDC`,
              icon: <Wallet size={14} className="text-white" />,
            },
            {
              label: "Active Bids",
              value: `${activeBids}`,
              icon: <Clock size={14} className="text-[#666]" />,
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
              <div className="text-[20px] font-semibold text-white">
                {stat.value}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Gateway Balance */}
        <motion.div
          className="bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a] p-5 mb-6"
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-medium text-white">
                Gateway Balance
              </span>
            </div>
            <button
              onClick={refreshGateway}
              disabled={gwLoading}
              className="text-[12px] text-[#666] hover:text-white transition-colors cursor-pointer flex items-center gap-1"
            >
              <RefreshCw
                size={12}
                className={gwLoading ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>

          {/* Unified balance + per-chain */}
          <div className="flex items-center gap-3 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={USDC_LOGO}
              alt="USDC"
              width={28}
              height={28}
              className="rounded-full shrink-0"
            />
            <div className="text-[24px] font-semibold text-white">
              {gwLoading ? "..." : fmtUsd(totalBalance)}
            </div>
          </div>

          {/* Per-chain breakdown with icons */}
          <div className="flex flex-wrap items-center gap-4 mb-4 text-[12px] text-[#666]">
            {balances.map((b) => {
              const chain = gatewayChains.find((c) => c.domain === b.domain);
              return (
                <div key={b.domain} className="flex items-center gap-1.5">
                  {chain && <ChainIcon chainId={chain.chainId} size={14} />}
                  <span>
                    {b.chainName
                      .replace(" Sepolia", "")
                      .replace(" Testnet", "")
                      .replace(" Fuji", "")}
                    :
                  </span>
                  <span className="text-[#999]">
                    {parseFloat(b.balance || "0").toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Deposit form */}
          <div className="border-t border-[#1a1a1a] pt-4">
            <div className="text-[12px] text-[#666] mb-2">
              Deposit USDC to Gateway
            </div>
            <div className="flex items-center gap-2">
              {/* Chain selector — same pattern as navbar */}
              <div ref={chainDropRef} className="relative">
                <button
                  onClick={() => setChainDropOpen(!chainDropOpen)}
                  className="flex items-center gap-2 px-3 py-2.5 bg-[#050505] border border-[#1a1a1a] rounded-xl text-[13px] text-white hover:border-[#222222] transition-colors cursor-pointer"
                >
                  <ChainIcon chainId={selectedChain.chainId} size={18} />
                  <span className="font-medium">{selectedChain.shortName}</span>
                  <ChevronDown size={12} className="text-[#555]" />
                </button>

                {chainDropOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-[#0a0a0a] border border-[#222] rounded-xl overflow-hidden min-w-[180px] z-50">
                    {depositableChains.map((chain) => (
                      <button
                        key={chain.chainId}
                        onClick={() => {
                          setSelectedChain(chain);
                          setChainDropOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 text-left px-4 py-2.5 text-[12px] transition-colors cursor-pointer ${
                          chain.chainId === selectedChain.chainId
                            ? "text-white bg-[#111]"
                            : "text-[#888] hover:text-white hover:bg-[#111]"
                        }`}
                      >
                        <ChainIcon chainId={chain.chainId} size={20} />
                        <span className="flex-1">{chain.shortName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Amount */}
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => handleNum(setDepositAmount)(e.target.value)}
                className="flex-1 px-3.5 py-2.5 bg-[#050505] rounded-xl border border-[#1a1a1a] text-[14px] text-white placeholder:text-[#444] outline-none focus:border-[#222222]"
              />

              {/* Deposit button */}
              <motion.button
                whileTap={buttonTap}
                onClick={handleGatewayDeposit}
                disabled={
                  depositing ||
                  !walletClient ||
                  !(parseFloat(depositAmount) > 0)
                }
                className="px-4 py-2.5 rounded-xl text-[13px] font-semibold bg-white text-[#111] cursor-pointer hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
              >
                {depositing && <Loader2 size={12} className="animate-spin" />}
                {depositing ? "Depositing..." : "Approve + Deposit"}
              </motion.button>
            </div>
            {depositStatus && (
              <div className="mt-2 text-[12px] text-[#888] flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" />
                {depositStatus}
              </div>
            )}
          </div>
        </motion.div>

        {/* Lend Form + Summary */}
        <div className="bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a] p-5 mb-6">
          <div className="text-[14px] font-medium text-white mb-4">
            Place Lend Bid
          </div>
          <div className="grid grid-cols-[1fr_260px] gap-5">
            {/* Left — form */}
            <div>
              <div className="mb-4">
                <label className="text-[12px] text-[#666] mb-1.5 block">
                  Tranche
                </label>
                <TrancheToggle
                  selected={tranche}
                  onChange={setTranche}
                  seniorRate={5.0}
                  juniorRate={12.0}
                />
              </div>

              <div className="mb-4">
                <label className="text-[12px] text-[#666] mb-1.5 block">
                  Min Rate (%)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="5.0"
                  value={minRate}
                  onChange={(e) => handleNum(setMinRate)(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#050505] rounded-xl border border-[#1a1a1a] text-[14px] text-white placeholder:text-[#444] outline-none focus:border-[#222222]"
                />
              </div>

              <div className="mb-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12px] text-[#666]">
                    Amount (USDC)
                  </label>
                  <span className="text-[12px] text-[#888]">
                    Available: {totalBalance.toLocaleString()} USDC
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => handleNum(setAmount)(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 bg-[#050505] rounded-xl border border-[#1a1a1a] text-[14px] text-white placeholder:text-[#444] outline-none focus:border-[#222222]"
                  />
                  <button
                    onClick={() => setAmount(totalBalance.toString())}
                    className="px-3 py-2.5 bg-[#050505] rounded-xl border border-[#1a1a1a] text-[12px] text-white font-semibold cursor-pointer hover:border-[#222222] transition-colors"
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    onClick={() =>
                      setAmount(((totalBalance * pct) / 100).toFixed(0))
                    }
                    className="flex-1 py-1 text-[11px] text-[#666] bg-[#050505] rounded-lg border border-[#1a1a1a] hover:text-[#999] hover:border-[#222222] transition-colors cursor-pointer"
                  >
                    {pct}%
                  </button>
                ))}
              </div>

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

              <motion.button
                whileTap={buttonTap}
                onClick={handleSubmitBid}
                disabled={!walletClient || submitting || parsedAmount <= 0}
                className="w-full py-3 rounded-xl text-[14px] font-semibold cursor-pointer bg-white text-[#111] hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
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
                <div className="text-[12px] text-[#999] mb-2">Bid Summary</div>
                {[
                  {
                    label: "Tranche",
                    value:
                      tranche === "senior" ? "Senior (70%)" : "Junior (30%)",
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
                        ? `${parsedAmount.toLocaleString()} USDC`
                        : "—",
                    cls: "text-white",
                  },
                  {
                    label: "Duration",
                    value: `${duration} days`,
                    cls: "text-white",
                  },
                  {
                    label: "Est. Earnings",
                    value:
                      expectedEarnings > 0 ? fmtUsd(expectedEarnings) : "—",
                    cls: "text-[#d4d4d4]",
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-[12px] text-[#666]">{row.label}</span>
                    <span className={`text-[12px] font-medium ${row.cls}`}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Order Book */}
        <div className="bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a] p-5 mb-6">
          <div className="text-[14px] font-medium text-white mb-4">
            Order Book
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Lend bids */}
            <div>
              <div className="text-[11px] text-[#555] uppercase tracking-wider mb-2">
                Lend Bids
              </div>
              <div className="bg-[#050505] rounded-xl border border-[#1a1a1a] overflow-hidden">
                <div className="grid grid-cols-[1fr_70px_50px_50px] items-center px-3 py-2 border-b border-[#1a1a1a] text-[10px] text-[#555] uppercase">
                  <span>Address</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Rate</span>
                  <span className="text-right">Days</span>
                </div>
                {(orderbook?.lends ?? []).length === 0 ? (
                  <div className="px-3 py-4 text-center text-[12px] text-[#444]">
                    No lend bids
                  </div>
                ) : (
                  <motion.div
                    variants={tableContainer}
                    initial="hidden"
                    animate="visible"
                  >
                    {(orderbook?.lends ?? []).slice(0, 8).map((o) => (
                      <motion.div
                        key={o.id}
                        variants={tableRow}
                        className="grid grid-cols-[1fr_70px_50px_50px] items-center px-3 py-2 border-b border-[#1a1a1a] last:border-b-0"
                      >
                        <span className="text-[11px] text-[#888] font-mono">
                          {truncAddr(o.address)}
                        </span>
                        <span className="text-[11px] text-white text-right">
                          {Number(formatEther(BigInt(o.amount))).toLocaleString()}
                        </span>
                        <span className="text-[11px] text-[#d4d4d4] text-right">
                          {o.minRate ?? "—"}%
                        </span>
                        <span className="text-[11px] text-[#666] text-right">
                          {o.duration}d
                        </span>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>
            </div>

            {/* Borrow bids */}
            <div>
              <div className="text-[11px] text-[#555] uppercase tracking-wider mb-2">
                Borrow Bids
              </div>
              <div className="bg-[#050505] rounded-xl border border-[#1a1a1a] overflow-hidden">
                <div className="grid grid-cols-[1fr_70px_50px_50px] items-center px-3 py-2 border-b border-[#1a1a1a] text-[10px] text-[#555] uppercase">
                  <span>Address</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Rate</span>
                  <span className="text-right">Days</span>
                </div>
                {(orderbook?.borrows ?? []).length === 0 ? (
                  <div className="px-3 py-4 text-center text-[12px] text-[#444]">
                    No borrow bids
                  </div>
                ) : (
                  <motion.div
                    variants={tableContainer}
                    initial="hidden"
                    animate="visible"
                  >
                    {(orderbook?.borrows ?? []).slice(0, 8).map((o) => (
                      <motion.div
                        key={o.id}
                        variants={tableRow}
                        className="grid grid-cols-[1fr_70px_50px_50px] items-center px-3 py-2 border-b border-[#1a1a1a] last:border-b-0"
                      >
                        <span className="text-[11px] text-[#888] font-mono">
                          {truncAddr(o.address)}
                        </span>
                        <span className="text-[11px] text-white text-right">
                          {Number(formatEther(BigInt(o.amount))).toLocaleString()}
                        </span>
                        <span className="text-[11px] text-[#888] text-right">
                          {o.maxRate ?? "—"}%
                        </span>
                        <span className="text-[11px] text-[#666] text-right">
                          {o.duration}d
                        </span>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Your Positions */}
        <div className="bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a] p-5">
          <div className="text-[14px] font-medium text-white mb-4">Your Positions</div>

          {!address ? (
            <div className="py-6 text-center text-[13px] text-[#555]">Connect wallet to view positions</div>
          ) : activeIntents.length === 0 && matchedPositions.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-[#555]">No positions yet</div>
          ) : (
            <div className="bg-[#050505] rounded-xl border border-[#1a1a1a] overflow-hidden">
              <div className="grid grid-cols-[1fr_1fr_80px_80px_100px] items-center px-4 py-2.5 border-b border-[#1a1a1a] text-[10px] text-[#555] uppercase tracking-wider">
                <span>Tranche</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Rate</span>
                <span className="text-right">Duration</span>
                <span className="text-right">Status</span>
              </div>

              <motion.div variants={tableContainer} initial="hidden" animate="visible">
                {matchedPositions.map((p) => (
                  <motion.div
                    key={`pos-${p.loanId}`}
                    variants={tableRow}
                    className="grid grid-cols-[1fr_1fr_80px_80px_100px] items-center px-4 py-3 border-b border-[#1a1a1a] last:border-b-0 hover:bg-[#080808] transition-colors"
                  >
                    <span className={`text-[12px] font-medium ${p.tranche === "senior" ? "text-[#d4d4d4]" : "text-[#888]"}`}>
                      {p.tranche === "senior" ? "Senior" : "Junior"}
                    </span>
                    <span className="text-[12px] text-white text-right">{Number(formatEther(BigInt(p.amount))).toLocaleString()} USDC</span>
                    <span className="text-[12px] text-[#666] text-right">—</span>
                    <span className="text-[12px] text-[#666] text-right">—</span>
                    <span className="text-right">
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#d4d4d4]/10 text-[#d4d4d4]">matched</span>
                    </span>
                  </motion.div>
                ))}

                {activeIntents.map((i) => (
                  <motion.div
                    key={`intent-${i.id}`}
                    variants={tableRow}
                    className="grid grid-cols-[1fr_1fr_80px_80px_100px] items-center px-4 py-3 border-b border-[#1a1a1a] last:border-b-0 hover:bg-[#080808] transition-colors"
                  >
                    <span className={`text-[12px] font-medium ${i.tranche === "senior" ? "text-[#d4d4d4]" : "text-[#888]"}`}>
                      {i.tranche === "senior" ? "Senior" : i.tranche === "junior" ? "Junior" : "—"}
                    </span>
                    <span className="text-[12px] text-white text-right">{Number(formatEther(BigInt(i.amount))).toLocaleString()} USDC</span>
                    <span className="text-[12px] text-white text-right">{i.minRate != null ? `${i.minRate}%` : "—"}</span>
                    <span className="text-[12px] text-[#666] text-right">{i.duration}d</span>
                    <span className="text-right">
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#222] text-[#666]">pending</span>
                    </span>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
