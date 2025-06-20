const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")
const { loadVerificationKey } = require("../../verifier/verifier.js")

module.exports = buildModule("Verifier", (m) => {
  const verificationKey = loadVerificationKey(hre.network.name)
  const verifier = m.contract("Groth16Verifier", [verificationKey], {})

  const testVerifier = m.contract("TestVerifier", [], {})

  return { verifier, testVerifier }
})
