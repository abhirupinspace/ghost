"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle, Clock, XCircle, Lock, Zap } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import { DotPattern } from "@/components/ui/dot-pattern";
import { CryptoIcon } from "@/components/CryptoIcon";
import { CreditScoreGauge } from "@/components/CreditScoreGauge";
import { HealthBar } from "@/components/HealthBar";
import { GatewayBalance } from "@/components/GatewayBalance";
import { GhostNameBadge } from "@/components/GhostNameBadge";
import { useIdentity } from "@/contexts/IdentityContext";
import {
  fmtUsd,
  getCreditTier,
  getCollateralRequired,
} from "@/lib/ghost-data";
import {
  fetchUserCredit,
  fetchUserLends,
  fetchUserBorrows,
  fetchLoans,
  fetchUserActivity,
  type UserLends,
  type UserBorrows,
  type UserLoans,
  type Activity,
} from "@/lib/api";
import {
  pageVariants,
  pageTransition,
  fadeInUp,
  tabPanel,
  tabTransition,
  tableContainer,
  tableRow,
} from "@/lib/motion";

type Tab = "overview" | "history" | "rewards";

function formatUsdc(wei: bigint | string): number {
  return Number(BigInt(wei)) / 1e6;
}

export default function PortfolioPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { walletAddress, ensName } = useIdentity();
  const { address } = useWallet();

  // Live data
  const [creditScore, setCreditScore] = useState(500);
  const [userLends, setUserLends] = useState<UserLends | null>(null);
  const [userBorrows, setUserBorrows] = useState<UserBorrows | null>(null);
  const [loans, setLoans] = useState<UserLoans | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);

  const tier = getCreditTier(creditScore);
  const collateralPct = getCollateralRequired(creditScore);

  const loadData = useCallback(async () => {
    if (!address) return;
    try {
      const [credit, lends, borrows, loansData, activityData] = await Promise.allSettled([
        fetchUserCredit(address),
        fetchUserLends(address),
        fetchUserBorrows(address),
        fetchLoans(address),
        fetchUserActivity(address),
      ]);
      if (credit.status === "fulfilled") setCreditScore(credit.value.creditScore);
      if (lends.status === "fulfilled") setUserLends(lends.value);
      if (borrows.status === "fulfilled") setUserBorrows(borrows.value);
      if (loansData.status === "fulfilled") setLoans(loansData.value);
      if (activityData.status === "fulfilled") setActivity(activityData.value);
    } catch {}
  }, [address]);

  useEffect(() => {
    loadData();
    const iv = setInterval(loadData, 30_000);
    return () => clearInterval(iv);
  }, [loadData]);

  // Derive lending positions
  const lendPositions = [
    ...(userLends?.positions ?? []).map((p) => ({
      id: `pos-${p.loanId}`,
      tranche: p.tranche,
      amount: Number(p.amount),
      status: "matched" as const,
    })),
    ...(userLends?.activeIntents ?? []).map((i) => ({
      id: `intent-${i.id}`,
      tranche: i.tranche ?? "senior",
      amount: Number(i.amount),
      status: "pending" as const,
    })),
  ];

  // Derive borrow positions
  const borrowPositions = (userBorrows?.loans ?? [])
    .filter((l) => !l.repaid && !l.defaulted)
    .map((l) => ({
      id: `loan-${l.loanId}`,
      principal: formatUsdc(l.principal),
      rate: Number(l.rate) / 100,
      duration: Number(l.duration) / 86400,
      startTime: Number(l.startTime),
    }));

  // Derive loan history
  const loanHistory = [
    ...(loans?.asBorrower ?? []).map((l) => ({
      id: `b-${l.id}`,
      type: "borrow" as const,
      amount: formatUsdc(l.principal),
      rate: Number(l.rate) / 100,
      status: l.repaid ? "repaid" as const : l.defaulted ? "default" as const : "active" as const,
      creditImpact: l.repaid ? 50 : l.defaulted ? -150 : 0,
    })),
    ...(loans?.asLender ?? []).map((l) => ({
      id: `l-${l.loanId}`,
      type: "lend" as const,
      amount: Number(l.amount),
      rate: 0,
      status: "active" as const,
      creditImpact: 0,
    })),
  ];

  const ghostPoints = 12_450;

  return (
    <motion.div
      className="min-h-screen bg-black text-white font-sans relative overflow-hidden"
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

      <div className="mt-10 mb-8" />

      <div className="relative z-10 max-w-[920px] mx-auto bg-[#0a0a0a] rounded-[20px] p-7 border border-[#1a1a1a]">
        {/* Tab bar */}
        <div className="flex items-center mb-6">
          {(["overview", "history", "rewards"] as const).map((tab) => (
            <span
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-[28px] font-semibold mr-5 cursor-pointer transition-colors ${
                activeTab === tab ? "text-white" : "text-[#555] hover:text-[#888]"
              }`}
            >
              {tab === "overview" ? "Overview" : tab === "history" ? "Loan History" : "Rewards"}
            </span>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "overview" ? (
            <motion.div
              key="overview"
              variants={tabPanel}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={tabTransition}
            >
              {/* Identity Card */}
              {walletAddress && (
                <motion.div
                  className="bg-[#050505] rounded-2xl border border-[#1a1a1a] p-5 mb-3 flex items-center justify-between"
                  variants={fadeInUp}
                  initial="hidden"
                  animate="visible"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-[40px] h-[40px] rounded-full bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center text-[16px] font-bold text-white">
                      {(walletAddress[2] ?? "G").toUpperCase()}
                    </div>
                    <div>
                      <GhostNameBadge showEdit />
                      <div className="text-[11px] text-[#555] mt-0.5 font-mono">
                        {walletAddress}
                        {ensName && <span className="ml-2 text-[#d4d4d4]">{ensName}</span>}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Credit Score Card */}
              <motion.div
                className="bg-[#050505] rounded-2xl border border-[#1a1a1a] p-5 mb-3"
                variants={fadeInUp}
                initial="hidden"
                animate="visible"
                transition={{ delay: 0.06 }}
              >
                <div className="flex items-center gap-6">
                  <CreditScoreGauge score={creditScore} size={140} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[20px] font-semibold text-white">{tier}</span>
                      <span className="text-[12px] px-2 py-0.5 rounded-full bg-[#d4d4d4]/10 text-[#d4d4d4]">
                        {collateralPct}% collateral
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-3">
                      <div>
                        <div className="text-[11px] text-[#555]">Score</div>
                        <div className="text-[16px] font-semibold text-white">{creditScore}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[#555]">On-chain Balance</div>
                        <div className="text-[16px] font-semibold text-[#d4d4d4]">
                          {userLends ? `${formatUsdc(userLends.onChainBalance).toLocaleString()} USDC` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[#555]">Collateral</div>
                        <div className="text-[16px] font-semibold text-white">
                          {userBorrows ? `${formatUsdc(userBorrows.onChainCollateral).toLocaleString()} USDC` : "—"}
                        </div>
                      </div>
                    </div>
                    {!address && (
                      <div className="mt-3 text-[12px] text-[#555]">Connect wallet to see your data</div>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Gateway Balance */}
              <div className="mb-3">
                <GatewayBalance />
              </div>

              {/* Active Lending Positions */}
              {lendPositions.length > 0 && (
                <div className="bg-[#050505] rounded-2xl border border-[#1a1a1a] overflow-hidden mb-3">
                  <div className="px-5 py-3 border-b border-[#1a1a1a]">
                    <span className="text-[12px] text-[#555] uppercase tracking-wider">Lending Positions</span>
                  </div>
                  <motion.div variants={tableContainer} initial="hidden" animate="visible">
                    {lendPositions.map((pos) => (
                      <motion.div
                        key={pos.id}
                        variants={tableRow}
                        className="flex items-center gap-4 px-5 py-3.5 border-b border-[#1a1a1a] last:border-b-0"
                      >
                        <CryptoIcon id="usdc" size={28} />
                        <div className="flex-1">
                          <div className="text-[13px] font-medium text-white">
                            USDC — <span className={pos.tranche === "senior" ? "text-[#d4d4d4]" : "text-[#888888]"}>{pos.tranche}</span>
                          </div>
                          <div className="text-[11px] text-[#555]">{pos.amount.toLocaleString()} USDC</div>
                        </div>
                        <div className="text-right">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                            pos.status === "matched" ? "bg-[#d4d4d4]/10 text-[#d4d4d4]" :
                            "bg-[#333]/30 text-[#666]"
                          }`}>
                            {pos.status}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
              )}

              {/* Active Borrow Positions */}
              {borrowPositions.length > 0 && (
                <div className="bg-[#050505] rounded-2xl border border-[#1a1a1a] overflow-hidden mb-3">
                  <div className="px-5 py-3 border-b border-[#1a1a1a]">
                    <span className="text-[12px] text-[#555] uppercase tracking-wider">Borrow Positions</span>
                  </div>
                  <motion.div variants={tableContainer} initial="hidden" animate="visible">
                    {borrowPositions.map((pos) => (
                      <motion.div
                        key={pos.id}
                        variants={tableRow}
                        className="flex items-center gap-4 px-5 py-3.5 border-b border-[#1a1a1a] last:border-b-0"
                      >
                        <CryptoIcon id="usdc" size={28} />
                        <div className="flex-1">
                          <div className="text-[13px] font-medium text-white">
                            USDC · {fmtUsd(pos.principal)}
                          </div>
                          <div className="text-[11px] text-[#555]">
                            {pos.rate.toFixed(1)}% · {pos.duration.toFixed(0)}d · Started {new Date(pos.startTime * 1000).toLocaleDateString()}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
              )}

              {/* Recent Activity */}
              {activity.length > 0 && (
                <div className="bg-[#050505] rounded-2xl border border-[#1a1a1a] overflow-hidden mb-3">
                  <div className="px-5 py-3 border-b border-[#1a1a1a]">
                    <span className="text-[12px] text-[#555] uppercase tracking-wider">Recent Activity</span>
                  </div>
                  <motion.div variants={tableContainer} initial="hidden" animate="visible">
                    {activity.slice(0, 10).map((a, i) => (
                      <motion.div
                        key={i}
                        variants={tableRow}
                        className="flex items-center gap-4 px-5 py-3.5 border-b border-[#1a1a1a] last:border-b-0"
                      >
                        <div className="flex-1">
                          <div className="text-[13px] text-white">{a.type}</div>
                          <div className="text-[11px] text-[#555]">{new Date(a.timestamp).toLocaleString()}</div>
                        </div>
                        <div className="text-[12px] text-[#d4d4d4]">{Number(a.amount).toLocaleString()} USDC</div>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
              )}
            </motion.div>
          ) : activeTab === "history" ? (
            <motion.div
              key="history"
              variants={tabPanel}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={tabTransition}
            >
              <div className="bg-[#050505] rounded-2xl border border-[#1a1a1a] overflow-hidden">
                {!address ? (
                  <div className="px-5 py-8 text-center text-[14px] text-[#555]">Connect wallet to view loan history</div>
                ) : loanHistory.length === 0 ? (
                  <div className="px-5 py-8 text-center text-[14px] text-[#555]">No loan history</div>
                ) : (
                  <motion.div variants={tableContainer} initial="hidden" animate="visible">
                    {loanHistory.map((loan) => {
                      const statusIcon = loan.status === "repaid"
                        ? <CheckCircle size={16} className="text-[#d4d4d4]" />
                        : loan.status === "active"
                        ? <Clock size={16} className="text-white" />
                        : <XCircle size={16} className="text-[#555555]" />;

                      const impactColor = loan.creditImpact >= 0 ? "text-[#d4d4d4]" : "text-[#555555]";

                      return (
                        <motion.div
                          key={loan.id}
                          variants={tableRow}
                          className="flex items-center gap-4 px-5 py-4 border-b border-[#1a1a1a] last:border-b-0 hover:bg-[#080808] transition-colors"
                        >
                          {statusIcon}
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium text-white">
                              {loan.type === "lend" ? "Lent" : "Borrowed"} {fmtUsd(loan.amount)} USDC
                            </div>
                            <div className="text-[11px] text-[#555]">
                              {loan.rate > 0 ? `${loan.rate.toFixed(1)}%` : ""} · {loan.status}
                            </div>
                          </div>
                          {loan.creditImpact !== 0 && (
                            <div className="text-right shrink-0">
                              <div className={`text-[13px] font-semibold ${impactColor}`}>
                                {loan.creditImpact >= 0 ? "+" : ""}{loan.creditImpact} pts
                              </div>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="rewards"
              variants={tabPanel}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={tabTransition}
            >
              <div className="bg-[#050505] rounded-2xl border border-[#1a1a1a] p-5 mb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13px] text-[#666] mb-1">Total Ghost Points</div>
                    <div className="text-[42px] font-light leading-none tracking-tight text-white">
                      {ghostPoints.toLocaleString()} <span className="text-[16px] text-[#555]">GP</span>
                    </div>
                  </div>
                  <div className="text-[12px] text-[#555] bg-[#111111] px-3 py-1.5 rounded-full border border-[#222222]">
                    2x multiplier
                  </div>
                </div>
              </div>

              <div className="bg-[#050505] rounded-2xl border border-white/20 p-4 mb-3">
                <div className="flex items-center gap-2 text-[13px]">
                  <Zap size={14} className="text-white" />
                  <span className="text-[#ccc]">Ghost Points boost your Credit Score</span>
                </div>
              </div>

              <div className="bg-[#050505] rounded-2xl border border-[#1a1a1a] p-5 mb-3">
                <div className="text-[14px] font-medium text-white mb-3">How to Earn</div>
                {[
                  { action: "Lend USDC", points: "100-500 GP per position", icon: Lock, color: "#ffffff" },
                  { action: "Repay loans on time", points: "50-300 GP per repayment", icon: CheckCircle, color: "#d4d4d4" },
                  { action: "Refer friends", points: "500 GP per referral", icon: Zap, color: "#ffffff" },
                ].map((item) => (
                  <div
                    key={item.action}
                    className="flex items-center gap-3 py-3 border-b border-[#1a1a1a] last:border-b-0"
                  >
                    <div
                      className="w-[32px] h-[32px] rounded-full flex items-center justify-center shrink-0"
                      style={{ background: `${item.color}15` }}
                    >
                      <item.icon size={14} style={{ color: item.color }} />
                    </div>
                    <div className="flex-1">
                      <div className="text-[13px] text-white">{item.action}</div>
                    </div>
                    <div className="text-[12px] text-[#888]">{item.points}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
