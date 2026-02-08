"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Wallet, Clock, DollarSign, Loader2, Shield } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import { DotPattern } from "@/components/ui/dot-pattern";
import { CryptoIcon } from "@/components/CryptoIcon";
import { CreditScoreGauge } from "@/components/CreditScoreGauge";
import { fmtUsd, getCreditTier, getCollateralRequired } from "@/lib/ghost-data";
import {
  fetchUserCredit,
  fetchUserBorrows,
  fetchOrderbook,
  submitBorrowIntent,
  type Orderbook,
  type UserBorrows,
} from "@/lib/api";
import {
  readBorrowerCollateral,
  readRequiredCollateral,
  readOwed,
  writeDepositCollateral,
  writeRepay,
} from "@/lib/contract";
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

export default function BorrowPage() {
  const { address, walletClient } = useWallet();

  // Form state
  const [amount, setAmount] = useState("");
  const [maxRate, setMaxRate] = useState("");
  const [duration, setDuration] = useState(90);
  const [submitting, setSubmitting] = useState(false);
  const [repaying, setRepaying] = useState<number | null>(null);

  // Collateral deposit
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);

  // Live data
  const [creditScore, setCreditScore] = useState(500);
  const [onChainCollateral, setOnChainCollateral] = useState(0);
  const [orderbook, setOrderbook] = useState<Orderbook | null>(null);
  const [userBorrows, setUserBorrows] = useState<UserBorrows | null>(null);
  const [requiredCollateral, setRequiredCollateral] = useState(0);

  const tier = getCreditTier(creditScore);
  const collateralPct = getCollateralRequired(creditScore);
  const parsedAmount = parseFloat(amount) || 0;
  const parsedRate = parseFloat(maxRate) || 8;
  const estimatedInterest =
    (parsedAmount * parsedRate * duration) / (365 * 100);
  const requiredCollateralUsd = parsedAmount * (collateralPct / 100);
  const savings = 150 - collateralPct;
  const activeBorrows = (userBorrows?.loans ?? []).filter(
    (l) => !l.repaid && !l.defaulted,
  );

  const loadUserData = useCallback(async () => {
    if (!address) return;
    try {
      const [credit, borrows, collateral] = await Promise.allSettled([
        fetchUserCredit(address),
        fetchUserBorrows(address),
        readBorrowerCollateral(address),
      ]);
      if (credit.status === "fulfilled")
        setCreditScore(credit.value.creditScore);
      if (borrows.status === "fulfilled") setUserBorrows(borrows.value);
      if (collateral.status === "fulfilled")
        setOnChainCollateral(Number(formatEther(collateral.value)));
    } catch {}
  }, [address]);

  const loadOrderbook = useCallback(async () => {
    try {
      const ob = await fetchOrderbook();
      setOrderbook(ob);
    } catch {}
  }, []);

  useEffect(() => {
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

  // Fetch required collateral from contract when amount changes
  useEffect(() => {
    if (!address || parsedAmount <= 0) {
      setRequiredCollateral(0);
      return;
    }
    readRequiredCollateral(address, parseEther(parsedAmount.toString()))
      .then((v) => setRequiredCollateral(Number(formatEther(v))))
      .catch(() => setRequiredCollateral(requiredCollateralUsd));
  }, [address, parsedAmount, requiredCollateralUsd]);

  const handleNum = (setter: (v: string) => void) => (value: string) => {
    if (value === "" || /^\d*\.?\d*$/.test(value)) setter(value);
  };

  const handleDepositCollateral = async () => {
    const amt = parseFloat(depositAmount);
    if (!walletClient || !amt || amt <= 0) return;
    setDepositing(true);
    try {
      await writeDepositCollateral(walletClient, parseEther(amt.toString()));
      setDepositAmount("");
      await loadUserData();
    } catch (e) {
      console.error("Deposit collateral failed:", e);
    } finally {
      setDepositing(false);
    }
  };

  const handleSubmitBorrow = async () => {
    if (!walletClient || !address || parsedAmount <= 0) return;
    setSubmitting(true);
    try {
      await submitBorrowIntent({
        address,
        amount: parseEther(parsedAmount.toString()).toString(),
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

  const loadData = async () => {
    await Promise.all([loadOrderbook(), loadUserData()]);
  };

  const handleRepay = async (loanId: number) => {
    if (!walletClient) return;
    setRepaying(loanId);
    try {
      const owed = await readOwed(BigInt(loanId));
      await writeRepay(walletClient, BigInt(loanId), owed);
      await loadUserData();
    } catch (e) {
      console.error("Repay failed:", e);
    } finally {
      setRepaying(null);
    }
  };

  const actualRequired =
    requiredCollateral > 0 ? requiredCollateral : requiredCollateralUsd;
  const collateralSufficient =
    parsedAmount <= 0 || onChainCollateral >= actualRequired;

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

        {/* Stats */}
        <motion.div
          className="grid grid-cols-3 gap-3 mb-6"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {[
            {
              label: "Credit Score",
              value: `${creditScore}`,
              icon: <Shield size={14} className="text-white" />,
            },
            {
              label: "On-Chain Collateral",
              value: `${onChainCollateral.toLocaleString()} USDC`,
              icon: <Wallet size={14} className="text-white" />,
            },
            {
              label: "Active Loans",
              value: `${activeBorrows.length}`,
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

        {/* Credit Score */}
        <motion.div
          className="bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a] p-5 mb-6"
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
        >
          <div className="text-[14px] font-medium text-white mb-4">
            Credit Score
          </div>
          <div className="flex items-center gap-6">
            <CreditScoreGauge score={creditScore} size={120} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[18px] font-semibold text-white">
                  {tier}
                </span>
                <span className="text-[12px] px-2 py-0.5 rounded-full bg-[#d4d4d4]/10 text-[#d4d4d4]">
                  {collateralPct}% collateral
                </span>
              </div>
              <div className="text-[13px] text-[#666] mb-3">
                {savings > 0 ? (
                  <>
                    You save{" "}
                    <span className="text-[#d4d4d4] font-medium">
                      {savings}%
                    </span>{" "}
                    vs new users
                  </>
                ) : (
                  "Build credit to reduce collateral requirements"
                )}
              </div>
              <div className="flex items-center gap-4 text-[12px] text-[#555]">
                <div>
                  Score:{" "}
                  <span className="text-white font-medium">{creditScore}</span>
                </div>
                <div>
                  Tier: <span className="text-white font-medium">{tier}</span>
                </div>
                <div>
                  Ratio:{" "}
                  <span className="text-white font-medium">
                    {collateralPct}%
                  </span>
                </div>
              </div>
              {!address && (
                <div className="text-[12px] text-[#555] mt-2">
                  Connect wallet to see your credit score
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Collateral Deposit */}
        <motion.div
          className="bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a] p-5 mb-6"
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.15 }}
        >
          <div className="text-[14px] font-medium text-white mb-4">
            Collateral
          </div>

          {/* Current balance */}
          <div className="flex items-center gap-3 mb-4">
            <CryptoIcon id="usdc" size={28} />
            <div className="text-[24px] font-semibold text-white">
              {onChainCollateral.toLocaleString()}{" "}
              <span className="text-[14px] text-[#666]">USDC</span>
            </div>
          </div>

          {/* Deposit form */}
          <div className="border-t border-[#1a1a1a] pt-4">
            <div className="text-[12px] text-[#666] mb-2">
              Deposit Collateral
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => handleNum(setDepositAmount)(e.target.value)}
                className="flex-1 px-3.5 py-2.5 bg-[#050505] rounded-xl border border-[#1a1a1a] text-[14px] text-white placeholder:text-[#444] outline-none focus:border-[#222222]"
              />
              <motion.button
                whileTap={buttonTap}
                onClick={handleDepositCollateral}
                disabled={
                  depositing ||
                  !walletClient ||
                  !(parseFloat(depositAmount) > 0)
                }
                className="px-4 py-2.5 rounded-xl text-[13px] font-semibold bg-white text-[#111] cursor-pointer hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
              >
                {depositing && <Loader2 size={12} className="animate-spin" />}
                {depositing ? "Depositing..." : "Deposit"}
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Borrow Form + Summary */}
        <div className="bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a] p-5 mb-6">
          <div className="text-[14px] font-medium text-white mb-4">
            Place Borrow Bid
          </div>
          <div className="grid grid-cols-[1fr_260px] gap-5">
            {/* Left — form */}
            <div>
              {/* Market display (fixed USDC) */}
              <div className="mb-4">
                <label className="text-[12px] text-[#666] mb-1.5 block">
                  Market
                </label>
                <div className="w-full flex items-center gap-3 px-3.5 py-2.5 bg-[#050505] rounded-xl border border-[#1a1a1a]">
                  <CryptoIcon id="usdc" size={24} />
                  <span className="text-[14px] text-white font-medium">
                    USDC
                  </span>
                  <span className="text-[12px] text-[#555] ml-auto">
                    Lending Market
                  </span>
                </div>
              </div>

              {/* Amount */}
              <div className="mb-2">
                <label className="text-[12px] text-[#666] mb-1.5 block">
                  Borrow Amount (USDC)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => handleNum(setAmount)(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#050505] rounded-xl border border-[#1a1a1a] text-[14px] text-white placeholder:text-[#444] outline-none focus:border-[#222222]"
                />
              </div>

              {/* Shortcuts */}
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
                <label className="text-[12px] text-[#666] mb-1.5 block">
                  Max Rate (%)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="8.0"
                  value={maxRate}
                  onChange={(e) => handleNum(setMaxRate)(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#050505] rounded-xl border border-[#1a1a1a] text-[14px] text-white placeholder:text-[#444] outline-none focus:border-[#222222]"
                />
              </div>

              {/* Required collateral info */}
              {parsedAmount > 0 && (
                <div className="bg-[#050505] rounded-xl border border-[#1a1a1a] p-3 mb-4">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#666]">Required Collateral</span>
                    <span className="text-white font-medium">
                      {actualRequired.toLocaleString()} USDC
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[12px] mt-1">
                    <span className="text-[#666]">Deposited</span>
                    <span
                      className={`font-medium ${collateralSufficient ? "text-[#d4d4d4]" : "text-[#888]"}`}
                    >
                      {onChainCollateral.toLocaleString()} USDC
                    </span>
                  </div>
                </div>
              )}

              {/* Warning when insufficient collateral */}
              {parsedAmount > 0 && !collateralSufficient && (
                <div className="bg-[#111] rounded-xl border border-[#222] p-3 mb-4 text-[12px] text-[#888]">
                  Insufficient collateral. Deposit{" "}
                  {(actualRequired - onChainCollateral).toLocaleString()} more
                  USDC above.
                </div>
              )}

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

              <motion.button
                whileTap={buttonTap}
                onClick={handleSubmitBorrow}
                disabled={!walletClient || submitting || parsedAmount <= 0}
                className="w-full py-3 rounded-xl text-[14px] font-semibold cursor-pointer bg-white text-[#111] hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {!walletClient
                  ? "Connect Wallet"
                  : submitting
                    ? "Submitting..."
                    : "Submit Borrow Bid"}
              </motion.button>
            </div>

            {/* Right — summary */}
            <div className="flex flex-col gap-3">
              <div className="bg-[#050505] rounded-xl border border-[#1a1a1a] p-3.5">
                <div className="text-[12px] text-[#999] mb-2">
                  Borrow Summary
                </div>
                {[
                  {
                    label: "Amount",
                    value:
                      parsedAmount > 0
                        ? `${parsedAmount.toLocaleString()} USDC`
                        : "—",
                    cls: "text-white",
                  },
                  {
                    label: "Collateral Ratio",
                    value: `${collateralPct}%`,
                    cls: "text-white",
                  },
                  {
                    label: "Required",
                    value:
                      parsedAmount > 0
                        ? `${actualRequired.toLocaleString()} USDC`
                        : "—",
                    cls: "text-white",
                  },
                  {
                    label: "Deposited",
                    value: `${onChainCollateral.toLocaleString()} USDC`,
                    cls: collateralSufficient
                      ? "text-[#d4d4d4]"
                      : "text-[#888]",
                  },
                  {
                    label: "Est. Interest",
                    value:
                      estimatedInterest > 0 ? fmtUsd(estimatedInterest) : "—",
                    cls: "text-white",
                  },
                  {
                    label: "Duration",
                    value: `${duration} days`,
                    cls: "text-white",
                  },
                  {
                    label: "Max Rate",
                    value: `${parsedRate.toFixed(1)}%`,
                    cls: "text-white",
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
                <div className="grid grid-cols-[1fr_auto_auto] items-center px-3 py-2 border-b border-[#1a1a1a] text-[10px] text-[#555] uppercase">
                  <span>Address</span>
                  <span className="text-right min-w-[80px]">Amount</span>
                  <span className="text-right min-w-[50px]">Days</span>
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
                    {[...(orderbook?.lends ?? [])]
                      .sort((a, b) => b.id - a.id)
                      .slice(0, 8)
                      .map((o) => (
                        <motion.div
                          key={o.id}
                          variants={tableRow}
                          className="grid grid-cols-[1fr_auto_auto] items-center px-3 py-2 border-b border-[#1a1a1a] last:border-b-0"
                        >
                          <span className="text-[11px] text-[#888] font-mono">
                            {truncAddr(o.address)}
                          </span>
                          <span className="text-[11px] text-white text-right min-w-[80px]">
                            {Number(formatEther(BigInt(o.amount))).toLocaleString()} USDC
                          </span>
                          <span className="text-[11px] text-[#666] text-right min-w-[50px]">
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
                <div className="grid grid-cols-[1fr_auto_auto] items-center px-3 py-2 border-b border-[#1a1a1a] text-[10px] text-[#555] uppercase">
                  <span>Address</span>
                  <span className="text-right min-w-[80px]">Amount</span>
                  <span className="text-right min-w-[50px]">Days</span>
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
                    {[...(orderbook?.borrows ?? [])]
                      .sort((a, b) => b.id - a.id)
                      .slice(0, 8)
                      .map((o) => (
                        <motion.div
                          key={o.id}
                          variants={tableRow}
                          className="grid grid-cols-[1fr_auto_auto] items-center px-3 py-2 border-b border-[#1a1a1a] last:border-b-0"
                        >
                          <span className="text-[11px] text-[#888] font-mono">
                            {truncAddr(o.address)}
                          </span>
                          <span className="text-[11px] text-white text-right min-w-[80px]">
                            {Number(formatEther(BigInt(o.amount))).toLocaleString()} USDC
                          </span>
                          <span className="text-[11px] text-[#666] text-right min-w-[50px]">
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

        {/* Active Borrows */}
        <div className="bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a] p-5">
          <div className="text-[14px] font-medium text-white mb-4">
            Active Borrows
          </div>

          {!address ? (
            <div className="py-6 text-center text-[13px] text-[#555]">
              Connect wallet to view borrows
            </div>
          ) : activeBorrows.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-[#555]">
              No active borrows
            </div>
          ) : (
            <div className="bg-[#050505] rounded-xl border border-[#1a1a1a] overflow-hidden">
              <div className="grid grid-cols-[60px_100px_70px_80px_1fr_80px] items-center px-4 py-2.5 border-b border-[#1a1a1a] text-[10px] text-[#555] uppercase tracking-wider">
                <span>Loan</span>
                <span className="text-right">Principal</span>
                <span className="text-right">Rate</span>
                <span className="text-right">Duration</span>
                <span className="text-right">Start</span>
                <span></span>
              </div>

              <motion.div
                variants={tableContainer}
                initial="hidden"
                animate="visible"
              >
                {activeBorrows.map((loan) => (
                  <motion.div
                    key={loan.loanId}
                    variants={tableRow}
                    className="grid grid-cols-[60px_100px_70px_80px_1fr_80px] items-center px-4 py-3 border-b border-[#1a1a1a] last:border-b-0 hover:bg-[#080808] transition-colors"
                  >
                    <span className="text-[12px] text-[#666]">
                      #{loan.loanId}
                    </span>
                    <span className="text-[12px] text-white text-right">
                      {Number(formatEther(loan.principal)).toLocaleString()} USDC
                    </span>
                    <span className="text-[12px] text-white text-right">
                      {(Number(loan.rate) / 100).toFixed(1)}%
                    </span>
                    <span className="text-[12px] text-[#666] text-right">
                      {(Number(loan.duration) / 86400).toFixed(0)}d
                    </span>
                    <span className="text-[12px] text-[#666] text-right">
                      {new Date(
                        Number(loan.startTime) * 1000,
                      ).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => handleRepay(loan.loanId)}
                      disabled={repaying === loan.loanId}
                      className="text-[12px] text-white font-medium text-right cursor-pointer hover:text-[#d4d4d4] transition-colors disabled:opacity-40 flex items-center justify-end gap-1"
                    >
                      {repaying === loan.loanId && (
                        <Loader2 size={12} className="animate-spin" />
                      )}
                      Repay
                    </button>
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
