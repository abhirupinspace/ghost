const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const GhostLending = await hre.ethers.getContractFactory("GhostLending");
  const lending = await GhostLending.deploy(deployer.address);
  await lending.waitForDeployment();

  const address = await lending.getAddress();
  console.log("GhostLending deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
