require("@nomicfoundation/hardhat-toolbox")
require("@nomicfoundation/hardhat-ignition-ethers")

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "paris",
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
      allowBlocksWithSameTimestamp: true,
      gas: "auto",
    },
    localhost: {
      tags: ["local"],
    },
    codexdisttestnetwork: {
      url: `${process.env.DISTTEST_NETWORK_URL}`,
    },
    codex_devnet: {
      url: process.env.CODEX_DEVNET_URL
        ? `${process.env.CODEX_DEVNET_URL}`
        : `https://public.sepolia.rpc.status.network`,
      chainId: 1660990954,
      accounts: process.env.CODEX_DEVNET_PRIVATE_KEY
        ? [process.env.CODEX_DEVNET_PRIVATE_KEY]
        : [],
    },
    codex_testnet: {
      url: `${process.env.CODEX_TESTNET_URL}`,
    },
    taiko_test: {
      url: "https://rpc.test.taiko.xyz",
      accounts: [
        // "<YOUR_SEPOLIA_TEST_WALLET_PRIVATE_KEY_HERE>"
      ],
    },
    linea_testnet: {
      url: `https://public.sepolia.rpc.status.network`,
      chainId: 1660990954,
      accounts: process.env.LINEA_TESTNET_PRIVATE_KEY
        ? [process.env.LINEA_TESTNET_PRIVATE_KEY]
        : [],
    },
  },
}
