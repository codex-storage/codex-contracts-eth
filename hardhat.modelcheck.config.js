const config = require("./hardhat.config")

config.solidity.settings.modelChecker = {
  engine: "chc",
  showUnproved: true,
  contracts: {
    "contracts/TestCollateral.sol": ["TestCollateral"],
  },
}

module.exports = config
