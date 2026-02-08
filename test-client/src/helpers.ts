import { ethers } from "ethers";

// -- Config --
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const API_KEY = process.env.API_KEY || "ghost-secret-key";
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";

// -- ABI (user + view fns) --
const GHOST_ABI = [
  "function depositLend() payable",
  "function withdrawLend(uint256 amount)",
  "function depositCollateral() payable",
  "function withdrawCollateral(uint256 amount)",
  "function repay(uint256 loanId) payable",
  "function getLenderBalance(address) view returns (uint256)",
  "function getBorrowerCollateral(address) view returns (uint256)",
  "function getLoan(uint256) view returns (address,uint256,uint256,uint256,uint256,uint256,bool,bool)",
  "function getLoanLenders(uint256) view returns (address[],uint256[],address[],uint256[])",
  "function getOwed(uint256) view returns (uint256)",
  "function isOverdue(uint256) view returns (bool)",
  "function getRequiredCollateral(address,uint256) view returns (uint256)",
  "function getCreditScore(address) view returns (uint256)",
  "function loanCount() view returns (uint256)",
];

// -- Provider --
export const provider = new ethers.JsonRpcProvider(RPC_URL);

// -- Wallets --
function loadWallet(envKey: string): ethers.Wallet {
  const key = process.env[envKey];
  if (!key) throw new Error(`${envKey} not set in .env`);
  return new ethers.Wallet(key, provider);
}

export const lender1 = loadWallet("LENDER1_PRIVATE_KEY");
export const lender2 = loadWallet("LENDER2_PRIVATE_KEY");
export const borrower1 = loadWallet("BORROWER1_PRIVATE_KEY");
export const borrower2 = loadWallet("BORROWER2_PRIVATE_KEY");

// -- Contract --
export function getContract(wallet: ethers.Wallet) {
  if (!CONTRACT_ADDRESS) throw new Error("CONTRACT_ADDRESS not set");
  return new ethers.Contract(CONTRACT_ADDRESS, GHOST_ABI, wallet);
}

export function getReadContract() {
  if (!CONTRACT_ADDRESS) throw new Error("CONTRACT_ADDRESS not set");
  return new ethers.Contract(CONTRACT_ADDRESS, GHOST_ABI, provider);
}

// -- API helpers --
export async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${SERVER_URL}${path}`, opts);
  return res.json() as Promise<{ ok: boolean; data?: any; error?: string }>;
}

export async function apiGet(path: string) {
  return api(path);
}

export async function apiPost(path: string, body: any) {
  return api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function apiDelete(path: string) {
  return api(path, { method: "DELETE" });
}

export async function triggerSettle() {
  return api("/trigger/settle", {
    method: "POST",
    headers: { "x-api-key": API_KEY },
  });
}

export async function triggerLiquidate() {
  return api("/trigger/liquidate", {
    method: "POST",
    headers: { "x-api-key": API_KEY },
  });
}

// -- Utils --
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitForIndexer(ms = 3000) {
  await sleep(ms);
}
