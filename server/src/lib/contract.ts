import { ethers } from "ethers";

const GHOST_LENDING_ABI = [
  "function lenderBalances(address) view returns (uint256)",
  "function borrowerCollateral(address) view returns (uint256)",
  "function loanCount() view returns (uint256)",
  "function getLenderBalance(address) view returns (uint256)",
  "function getBorrowerCollateral(address) view returns (uint256)",
  "function getLoan(uint256) view returns (address,uint256,uint256,uint256,uint256,uint256,bool,bool)",
  "function getLoanLenders(uint256) view returns (address[],uint256[],address[],uint256[])",
  "function getOwed(uint256) view returns (uint256)",
  "function isOverdue(uint256) view returns (bool)",
  "function getRequiredCollateral(address,uint256) view returns (uint256)",
  "function getCreditScore(address) view returns (uint256)",
  "function executeLoan(address,address[],uint256[],address[],uint256[],uint256,uint256,uint256,uint256)",
  "function liquidate(uint256)",
  "event LendDeposited(address indexed lender, uint256 amount)",
  "event LendWithdrawn(address indexed lender, uint256 amount)",
  "event CollateralDeposited(address indexed borrower, uint256 amount)",
  "event CollateralWithdrawn(address indexed borrower, uint256 amount)",
  "event LoanCreated(uint256 indexed loanId, address indexed borrower, uint256 principal)",
  "event LoanRepaid(uint256 indexed loanId, address indexed borrower, uint256 totalPaid)",
  "event LoanDefaulted(uint256 indexed loanId, address indexed borrower)",
];

const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
const contractAddress = process.env.CONTRACT_ADDRESS || "";
const serverKey = process.env.SERVER_PRIVATE_KEY || "";

export const provider = new ethers.JsonRpcProvider(rpcUrl);

export const getContract = () => {
  if (!contractAddress) throw new Error("CONTRACT_ADDRESS not set");
  return new ethers.Contract(contractAddress, GHOST_LENDING_ABI, provider);
};

export const getSignedContract = () => {
  if (!serverKey) throw new Error("SERVER_PRIVATE_KEY not set");
  const wallet = new ethers.Wallet(serverKey, provider);
  return new ethers.Contract(contractAddress, GHOST_LENDING_ABI, wallet);
};

export { GHOST_LENDING_ABI };
