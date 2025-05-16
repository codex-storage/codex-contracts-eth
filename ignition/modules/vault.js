const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")
const TokenModule = require("./token.js")

module.exports = buildModule("Vault", (m) => {
  const deployer = m.getAccount(0)
  const { token } = m.useModule(TokenModule)

  const vault = m.contract("Vault", [token], {
    from: deployer,
  })

  return { vault, token }
})
