import { ethers } from "ethers";

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY;

if (!SERVER_PRIVATE_KEY) {
  console.error("SERVER_PRIVATE_KEY not set in .env");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const funder = new ethers.Wallet(SERVER_PRIVATE_KEY, provider);

const walletKeys = [
  process.env.LENDER1_PRIVATE_KEY,
  process.env.LENDER2_PRIVATE_KEY,
  process.env.BORROWER1_PRIVATE_KEY,
  process.env.BORROWER2_PRIVATE_KEY,
];

const FUND_AMOUNT = ethers.parseEther("0.5");

async function main() {
  console.log(`Funder: ${funder.address}`);
  const balance = await provider.getBalance(funder.address);
  console.log(`Funder balance: ${ethers.formatEther(balance)} ETH`);

  for (const key of walletKeys) {
    if (!key) {
      console.warn("Skipping undefined wallet key");
      continue;
    }
    const wallet = new ethers.Wallet(key);
    const existing = await provider.getBalance(wallet.address);
    if (existing >= FUND_AMOUNT) {
      console.log(`${wallet.address} already funded (${ethers.formatEther(existing)})`);
      continue;
    }
    console.log(`Funding ${wallet.address}...`);
    const tx = await funder.sendTransaction({
      to: wallet.address,
      value: FUND_AMOUNT,
    });
    await tx.wait();
    console.log(`  tx: ${tx.hash}`);
  }
  console.log("Done!");
}

main().catch(console.error);
