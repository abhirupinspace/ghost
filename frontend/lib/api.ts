const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "API error");
  return json.data as T;
}

// ── Market ──

export interface OrderbookIntent {
  id: number;
  address: string;
  type: "lend" | "borrow";
  amount: string;
  minRate: number | null;
  maxRate: number | null;
  duration: number;
  tranche: string | null;
  active: boolean;
  createdAt: string;
}

export interface Orderbook {
  lends: OrderbookIntent[];
  borrows: OrderbookIntent[];
}

export function fetchOrderbook(): Promise<Orderbook> {
  return api("/market/orderbook");
}

export interface MarketStats {
  lendSupply: { count: number; total: string };
  borrowDemand: { count: number; total: string };
  activeLoans: { count: number; total: string };
}

export function fetchMarketStats(): Promise<MarketStats> {
  return api("/market/stats");
}

// ── Intents ──

export function submitLendIntent(body: {
  address: string;
  amount: string;
  duration: number;
  minRate?: number;
  tranche?: string;
}) {
  return api("/intent/lend", { method: "POST", body: JSON.stringify(body) });
}

export function submitBorrowIntent(body: {
  address: string;
  amount: string;
  duration: number;
  maxRate?: number;
}) {
  return api("/intent/borrow", { method: "POST", body: JSON.stringify(body) });
}

export function cancelIntent(id: number) {
  return api(`/intent/${id}`, { method: "DELETE" });
}

// ── User ──

export interface UserLends {
  onChainBalance: string;
  activeIntents: OrderbookIntent[];
  positions: Array<{
    loanId: number;
    amount: string;
    tranche: string;
  }>;
}

export function fetchUserLends(address: string): Promise<UserLends> {
  return api(`/user/${address}/lends`);
}

export interface UserBorrows {
  onChainCollateral: string;
  activeIntents: OrderbookIntent[];
  loans: Array<{
    loanId: number;
    borrower: string;
    principal: string;
    rate: string;
    duration: string;
    startTime: string;
    repaid: boolean;
    defaulted: boolean;
  }>;
}

export function fetchUserBorrows(address: string): Promise<UserBorrows> {
  return api(`/user/${address}/borrows`);
}

export interface UserCredit {
  address: string;
  creditScore: number;
}

export function fetchUserCredit(address: string): Promise<UserCredit> {
  return api(`/user/${address}/credit`);
}

export interface Activity {
  type: string;
  amount: string;
  txHash: string;
  timestamp: string;
  details: Record<string, unknown>;
}

export function fetchUserActivity(address: string): Promise<Activity[]> {
  return api(`/user/${address}/activity`);
}

// ── Loans ──

export interface UserLoans {
  asBorrower: Array<{
    id: number;
    borrower: string;
    principal: string;
    rate: string;
    duration: string;
    startTime: string;
    repaid: boolean;
    defaulted: boolean;
  }>;
  asLender: Array<{
    loanId: number;
    lender: string;
    amount: string;
    tranche: string;
  }>;
}

export function fetchLoans(address: string): Promise<UserLoans> {
  return api(`/loans/${address}`);
}
