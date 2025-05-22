const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")

const MAX_ACCOUNTS = 20
const MINTED_TOKENS = 1_000_000_000_000_000n

module.exports = buildModule("Token", (m) => {
  const deployer = m.getAccount(0)

  const token = m.contract("TestToken", [], {
    from: deployer,
  })

  const config = hre.network.config

  if (config && config.tags && config.tags.includes("local")) {
    for (let i = 0; i < MAX_ACCOUNTS; i++) {
      const account = m.getAccount(i)
      m.call(token, "mint", [account, MINTED_TOKENS], {
        from: deployer,
        id: `SendingTestTokens_${i}`,
      })
    }
  }

  return { token }
})
