const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")
const VerifierModule = require("./verifier.js")

module.exports = buildModule("Proofs", (m) => {
  const { verifier } = m.useModule(VerifierModule)
  const configuration = m.getParameter("configuration", null)

  const testProofs = m.contract("TestProofs", [])
  m.call(testProofs, "initialize", [configuration, verifier])

  return { testProofs }
})
