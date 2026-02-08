require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    arc: {
      url: "https://rpc.arc.money",
      chainId: 5042002,
      accounts: process.env.MAIN_PRIVATE_KEY ? [process.env.MAIN_PRIVATE_KEY] : [],
    },
  },
};
