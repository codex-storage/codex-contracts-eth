require("@nomiclabs/hardhat-waffle")
require("hardhat-deploy")
require("hardhat-deploy-ethers")

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
  mocha: {
    bail: true,
    slow: 200,
    timeout: 30 * 1000,
  },
  namedAccounts: {
    deployer: { default: 0 },
  },
  networks: {
    hardhat: {
      tags: ["local"],
    },
  },
}
