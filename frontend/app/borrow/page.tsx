"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2 } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import { DotPattern } from "@/components/ui/dot-pattern";
import { CryptoIcon } from "@/components/CryptoIcon";
import { CreditScoreGauge } from "@/components/CreditScoreGauge";
import { HealthBar } from "@/components/HealthBar";
import {
  fmtUsd,
  getCreditTier,
  getCollateralRequired,
} from "@/lib/ghost-data";
import {
  fetchUserCredit,
  fetchUserBorrows,
  fetchOrderbook,
  submitBorrowIntent,
  type Orderbook,
  type UserBorrows,
} from "@/lib/api";
import {
  readRequiredCollateral,
  readOwed,
  writeDepositCollateral,
  writeRepay,
} from "@/lib/contract";
import {
  pageVariants,
  pageTransition,
  fadeInUp,
  tableContainer,
  tableRow,
  buttonTap,
} from "@/lib/motion";

function parseUsdc(amount: number): bigint {
  return BigInt(Math.floor(amount * 1e6));
}

function formatUsdc(wei: bigint | string): number {
  return Number(BigInt(wei)) / 1e6;
}

function truncAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

export default function BorrowPage() {
  const { address, walletClient } = useWallet();

  const [amount, setAmount] = useState("");
  const [maxRate, setMaxRate] = useState("");
  const [duration, setDuration] = useState(90);
  const [submitting, setSubmitting] = useState(false);
  const [repaying, setRepaying] = useState<number | null>(null);

  // Live data
  const [creditScore, setCreditScore] = useState(500);
  const [orderbook, setOrderbook] = useState<Orderbook | null>(null);
  const [userBorrows, setUserBorrows] = useState<UserBorrows | null>(null);
  const [requiredCollateral, setRequiredCollateral] = useState<number>(0);

  const tier = getCreditTier(creditScore);
  const collateralPct = getCollateralRequired(creditScore);
  const parsedAmount = parseFloat(amount) || 0;
  const parsedRate = parseFloat(maxRate) || 8;
  const estimatedInterest = (parsedAmount * parsedRate * duration) / (365 * 100);
  const requiredCollateralUsd = parsedAmount * (collateralPct / 100);
  const savings = 150 - collateralPct;

  const loadData = useCallback(async () => {
    try {
      const ob = await fetchOrderbook().catch(() => null);
      if (ob) setOrderbook(ob);
    } catch {}

    if (!address) return;
    try {
      const [credit, borrows] = await Promise.allSettled([
        fetchUserCredit(address),
        fetchUserBorrows(address),
      ]);
      if (credit.status === "fulfilled") {
        setCreditScore(credit.value.creditScore);
      }
      if (borrows.status === "fulfilled") {
        setUserBorrows(borrows.value);
      }
    } catch {}
  }, [address]);

  // Fetch required collateral from contract when amount changes
  useEffect(() => {
    if (!address || parsedAmount <= 0) {
      setRequiredCollateral(0);
      return;
    }
    readRequiredCollateral(address, parseUsdc(parsedAmount))
      .then((v) => setRequiredCollateral(formatUsdc(v)))
      .catch(() => setRequiredCollateral(requiredCollateralUsd));
  }, [address, parsedAmount, requiredCollateralUsd]);

  useEffect(() => {
    loadData();
    const iv = setInterval(loadData, 15_000);
    return () => clearInterval(iv);
  }, [loadData]);

  const handleNum = (setter: (v: string) => void) => (value: string) => {
    if (value === "" || /^\d*\.?\d*$/.test(value)) setter(value);
  };

  const handleSubmitBorrow = async () => {
    if (!walletClient || !address || parsedAmount <= 0) return;
    setSubmitting(true);
    try {
      // 1. Deposit collateral on-chain
      const collateralWei = parseUsdc(requiredCollateral > 0 ? requiredCollateral : requiredCollateralUsd);
      await writeDepositCollateral(walletClient, collateralWei);
      // 2. Submit intent to server
      await submitBorrowIntent({
        address,
        amount: parsedAmount,
        duration,
        maxRate: parsedRate,
      });
      setAmount("");
      setMaxRate("");
      await loadData();
    } catch (e) {
      console.error("Submit borrow failed:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRepay = async (loanId: number) => {
    if (!walletClient) return;
    setRepaying(loanId);
    try {
      const owed = await readOwed(BigInt(loanId));
      await writeRepay(walletClient, BigInt(loanId), owed);
      await loadData();
    } catch (e) {
      console.error("Repay failed:", e);
    } finally {
      setRepaying(null);
    }
  };

  // Derive active borrows from API
  const activeBorrows = (userBorrows?.loans ?? []).filter((l) => !l.repaid && !l.defaulted);

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
        <h1 className="text-[28px] font-semibold text-white mb-6">Borrow</h1>

        {/* Credit score banner */}
        <motion.div
          className="bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a] p-5 mb-6 flex items-center gap-6"
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
        >
          <CreditScoreGauge score={creditScore} size={120} />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[18px] font-semibold text-white">{tier}</span>
              <span className="text-[12px] px-2 py-0.5 rounded-full bg-[#d4d4d4]/10 text-[#d4d4d4]">
                {collateralPct}% collateral
              </span>
            </div>
            <div className="text-[13px] text-[#666] mb-3">
              {savings > 0 ? (
                <>You save <span className="text-[#d4d4d4] font-medium">{savings}%</span> vs new users</>
              ) : (
                "Build credit to reduce collateral requirements"
              )}
            </div>
            {!address && (
              <div className="text-[12px] text-[#555]">Connect wallet to see your credit score</div>
            )}
          </div>
        </motion.div>

        {/* Borrow form */}
        <div className="bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a] p-5 mb-6">
          <div className="grid grid-cols-[1fr_260px] gap-5">
            <div>
              {/* Market display (fixed USDC) */}
              <div className="mb-4">
                <label className="text-[12px] text-[#666] mb-1.5 block">Market</label>
                <div className="w-full flex items-center gap-3 px-3.5 py-2.5 bg-[#050505] rounded-xl border border-[#1a1a1a]">
                  <CryptoIcon id="usdc" size={24} />
                  <span className="text-[14px] text-white font-medium">USDC</span>
                  <span className="text-[12px] text-[#555] ml-auto">Lending Market</span>
                </div>
              </div>

              {/* Amount */}
              <div className="mb-2">
                <label className="text-[12px] text-[#666] mb-1.5 block">Borrow Amount (USDC)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => handleNum(setAmount)(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#050505] rounded-xl border border-[#1a1a1a] text-[14px] text-white placeholder:text-[#444] outline-none focus:border-[#222222]"
                />
              </div>

              {/* shortcuts */}
              <div className="flex items-center gap-2 mb-4">
                {[1000, 5000, 10000, 25000].map((val) => (
                  <button
                    key={val}
                    onClick={() => setAmount(val.toString())}
                    className="flex-1 py-1 text-[11px] text-[#666] bg-[#050505] rounded-lg border border-[#1a1a1a] hover:text-[#999] hover:border-[#222222] transition-colors cursor-pointer"
                  >
                    {(val / 1000).toFixed(0)}K
                  </button>
                ))}
              </div>

              {/* Max rate */}
              <div className="mb-4">
                <label className="text-[12px] text-[#666] mb-1.5 block">Max Rate (%)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="8.0"
                  value={maxRate}
                  onChange={(e) => handleNum(setMaxRate)(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#050505] rounded-xl border border-[#1a1a1a] text-[14px] text-white placeholder:text-[#444] outline-none focus:border-[#222222]"
                />
              </div>

              {/* Required collateral (USDC) */}
              {parsedAmount > 0 && (
                <div className="bg-[#050505] rounded-xl border border-[#1a1a1a] p-3 mb-4">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#666]">Required Collateral</span>
                    <span className="text-white font-medium">
                      {(requiredCollateral > 0 ? requiredCollateral : requiredCollateralUsd).toLocaleString()} USDC
                    </span>
                  </div>
                </div>
              )}

              {/* Duration */}
              <div className="mb-4">
                <label className="text-[12px] text-[#666] mb-1.5 block">Duration</label>
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
                onClick={handleSubmitBorrow}
                disabled={!walletClient || submitting || parsedAmount <= 0}
                className="w-full py-3 rounded-xl text-[14px] font-semibold cursor-pointer bg-white text-[#111] hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {!walletClient ? "Connect Wallet" : submitting ? "Submitting..." : "Submit Borrow Bid"}
              </motion.button>
            </div>

            {/* Right — summary */}
            <div className="flex flex-col gap-3">
              <div className="bg-[#050505] rounded-xl border border-[#1a1a1a] p-3.5">
                <div className="text-[12px] text-[#999] mb-2">Borrow Summary</div>
                {[
                  { label: "Amount", value: parsedAmount > 0 ? `${parsedAmount.toLocaleString()} USDC` : "—", cls: "text-white" },
                  { label: "Collateral Ratio", value: `${collateralPct}%`, cls: "text-white" },
                  { label: "Required Collateral", value: parsedAmount > 0 ? `${(requiredCollateral > 0 ? requiredCollateral : requiredCollateralUsd).toLocaleString()} USDC` : "—", cls: "text-white" },
                  { label: "Est. Interest", value: estimatedInterest > 0 ? fmtUsd(estimatedInterest) : "—", cls: "text-white" },
                  { label: "Duration", value: `${duration} days`, cls: "text-white" },
                  { label: "Max Rate", value: `${parsedRate.toFixed(1)}%`, cls: "text-white" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-1">
                    <span className="text-[12px] text-[#666]">{row.label}</span>
                    <span className={`text-[12px] font-medium ${row.cls}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Order Book */}
        <div className="bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a] p-5 mb-6">
          <div className="text-[14px] font-medium text-white mb-4">Order Book</div>
          <div className="grid grid-cols-2 gap-4">
            {/* Lend bids */}
            <div>
              <div className="text-[11px] text-[#555] uppercase tracking-wider mb-2">Lend Bids</div>
              <div className="bg-[#050505] rounded-xl border border-[#1a1a1a] overflow-hidden">
                <div className="grid grid-cols-[1fr_70px_50px_50px] items-center px-3 py-2 border-b border-[#1a1a1a] text-[10px] text-[#555] uppercase">
                  <span>Address</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Rate</span>
                  <span className="text-right">Days</span>
                </div>
                {(orderbook?.lends ?? []).length === 0 ? (
                  <div className="px-3 py-4 text-center text-[12px] text-[#444]">No lend bids</div>
                ) : (
                  (orderbook?.lends ?? []).slice(0, 8).map((o) => (
                    <div key={o.id} className="grid grid-cols-[1fr_70px_50px_50px] items-center px-3 py-2 border-b border-[#1a1a1a] last:border-b-0">
                      <span className="text-[11px] text-[#888] font-mono">{truncAddr(o.address)}</span>
                      <span className="text-[11px] text-white text-right">{Number(o.amount).toLocaleString()}</span>
                      <span className="text-[11px] text-[#d4d4d4] text-right">{o.minRate ?? "—"}%</span>
                      <span className="text-[11px] text-[#666] text-right">{o.duration}d</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Borrow bids */}
            <div>
              <div className="text-[11px] text-[#555] uppercase tracking-wider mb-2">Borrow Bids</div>
              <div className="bg-[#050505] rounded-xl border border-[#1a1a1a] overflow-hidden">
                <div className="grid grid-cols-[1fr_70px_50px_50px] items-center px-3 py-2 border-b border-[#1a1a1a] text-[10px] text-[#555] uppercase">
                  <span>Address</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Rate</span>
                  <span className="text-right">Days</span>
                </div>
                {(orderbook?.borrows ?? []).length === 0 ? (
                  <div className="px-3 py-4 text-center text-[12px] text-[#444]">No borrow bids</div>
                ) : (
                  (orderbook?.borrows ?? []).slice(0, 8).map((o) => (
                    <div key={o.id} className="grid grid-cols-[1fr_70px_50px_50px] items-center px-3 py-2 border-b border-[#1a1a1a] last:border-b-0">
                      <span className="text-[11px] text-[#888] font-mono">{truncAddr(o.address)}</span>
                      <span className="text-[11px] text-white text-right">{Number(o.amount).toLocaleString()}</span>
                      <span className="text-[11px] text-[#888] text-right">{o.maxRate ?? "—"}%</span>
                      <span className="text-[11px] text-[#666] text-right">{o.duration}d</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Active Borrows */}
        <div className="bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1a1a1a]">
            <span className="text-[14px] font-medium text-white">Active Borrows</span>
          </div>

          {!address ? (
            <div className="px-5 py-8 text-center text-[14px] text-[#555]">Connect wallet to view borrows</div>
          ) : activeBorrows.length === 0 ? (
            <div className="px-5 py-8 text-center text-[14px] text-[#555]">No active borrows</div>
          ) : (
            <>
              <div className="grid grid-cols-[60px_100px_70px_80px_1fr_80px] items-center px-5 py-3 border-b border-[#1a1a1a] text-[11px] text-[#555] uppercase tracking-wider">
                <span>Loan</span>
                <span className="text-right">Principal</span>
                <span className="text-right">Rate</span>
                <span className="text-right">Duration</span>
                <span className="text-right">Start</span>
                <span></span>
              </div>

              <motion.div variants={tableContainer} initial="hidden" animate="visible">
                {activeBorrows.map((loan) => (
                  <motion.div
                    key={loan.loanId}
                    variants={tableRow}
                    className="grid grid-cols-[60px_100px_70px_80px_1fr_80px] items-center px-5 py-3.5 border-b border-[#1a1a1a] last:border-b-0 hover:bg-[#111111] transition-colors"
                  >
                    <span className="text-[12px] text-[#666]">#{loan.loanId}</span>
                    <span className="text-[12px] text-white text-right">{formatUsdc(loan.principal).toLocaleString()} USDC</span>
                    <span className="text-[12px] text-white text-right">{(Number(loan.rate) / 100).toFixed(1)}%</span>
                    <span className="text-[12px] text-[#666] text-right">{(Number(loan.duration) / 86400).toFixed(0)}d</span>
                    <span className="text-[12px] text-[#666] text-right">
                      {new Date(Number(loan.startTime) * 1000).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => handleRepay(loan.loanId)}
                      disabled={repaying === loan.loanId}
                      className="text-[12px] text-white font-medium text-right cursor-pointer hover:text-white transition-colors disabled:opacity-40 flex items-center justify-end gap-1"
                    >
                      {repaying === loan.loanId && <Loader2 size={12} className="animate-spin" />}
                      Repay
                    </button>
                  </motion.div>
                ))}
              </motion.div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
