require("@nomiclabs/hardhat-waffle")
require("hardhat-deploy")
require("hardhat-deploy-ethers")
require("hardhat-gas-reporter")

module.exports = {
  solidity: {
    version: "0.8.8",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  namedAccounts: {
    deployer: { default: 0 },
  },
  networks: {
    hardhat: {
      tags: ["local"],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
    showTimeSpent: true,
    coinmarketcap: process.env.CMC_API_KEY
  },
}
