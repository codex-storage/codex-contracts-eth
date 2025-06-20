const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")
const TokenModule = require("./token.js")

module.exports = buildModule("Vault", (m) => {
  const { token } = m.useModule(TokenModule)

  const vault = m.contract("Vault", [token], {})

  return { vault, token }
})
