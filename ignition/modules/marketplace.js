const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")
const { loadZkeyHash } = require("../../verifier/verifier.js")
const { loadConfiguration } = require("../../configuration/configuration.js")
const TokenModule = require("./token.js")
const VerifierModule = require("./verifier.js")

function getDefaultConfig() {
  const zkeyHash = loadZkeyHash(hre.network.name)
  const config = loadConfiguration(hre.network.name)
  config.proofs.zkeyHash = zkeyHash
  return config
}

function getDefaultVerifier(m) {
  const { verifier } = m.useModule(VerifierModule)
  return verifier
}

module.exports = buildModule("Marketplace", (m) => {
  const deployer = m.getAccount(0)

  const { token } = m.useModule(TokenModule)
  const { verifier } = m.useModule(VerifierModule)
  const configuration = m.getParameter("configuration", getDefaultConfig())

  const marketplace = m.contract(
    "Marketplace",
    [configuration, token, verifier],
    {
      from: deployer,
    }
  )

  let testMarketplace

  if (hre.network.config.tags.includes("local")) {
    const { testVerifier } = m.useModule(VerifierModule)

    testMarketplace = m.contract(
      "TestMarketplace",
      [configuration, token, testVerifier],
      {
        from: deployer,
      }
    )
  }

  return {
    marketplace,
    testMarketplace,
    token,
  }
})
