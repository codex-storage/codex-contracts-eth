const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")

const MAX_ACCOUNTS = 20
const MINTED_TOKENS = 1_000_000_000_000_000n

module.exports = buildModule("Token", (m) => {
  const deployer = m.getAccount(0)

  const token = m.contract("TestToken", [], {
    from: deployer,
  })

  if (hre.network.config.tags.includes("local")) {
    for (let i = 0; i < MAX_ACCOUNTS; i++) {
      const account = m.getAccount(i)
      const futureId = "SendingEth" + i
      m.send(futureId, account, MINTED_TOKENS)
    }
  }

  return { token }
})
