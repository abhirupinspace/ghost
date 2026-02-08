const hre = require("hardhat");

async function main() {
  const [main] = await hre.ethers.getSigners();
  const wallets = process.env.FUND_WALLETS?.split(",") || [];
  const amount = hre.ethers.parseEther(process.env.FUND_AMOUNT || "1");

  console.log("Funding from:", main.address);

  for (const wallet of wallets) {
    const addr = wallet.trim();
    if (!addr) continue;
    const tx = await main.sendTransaction({ to: addr, value: amount });
    await tx.wait();
    console.log(`Sent ${hre.ethers.formatEther(amount)} to ${addr}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
