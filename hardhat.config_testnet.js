require("@nomiclabs/hardhat-waffle")
require("hardhat-deploy")
require("hardhat-deploy-ethers")

const
  TESTNET_ID = "..." // e.g. "2337"

  TESTNET_URL = "http://127.0.0.1:8545"

  // keys for funded accounts unlocked on the node corresponding to TESTNET_URL
  TESTNET_PRIVATE_KEYS = [
    "...",
    "..."
  ]

module.exports = {
  solidity: "0.8.4",
  networks: {
    [`${TESTNET_ID}`]: {
      url: TESTNET_URL,
      accounts: TESTNET_PRIVATE_KEYS
    }
  }
}
