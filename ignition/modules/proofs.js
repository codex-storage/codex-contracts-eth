const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")
const VerifierModule = require("./verifier.js")

module.exports = buildModule("Proofs", (m) => {
  const deployer = m.getAccount(0)

  const { verifier } = m.useModule(VerifierModule)
  const configuration = m.getParameter("configuration", null)

  const testProofs = m.contract("TestProofs", [configuration, verifier], {
    from: deployer,
  })

  return { testProofs }
})
