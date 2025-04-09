const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")
const { loadVerificationKey } = require("../../verifier/verifier.js")

module.exports = buildModule("Verifier", (m) => {
  const deployer = m.getAccount(0)

  const verificationKey = loadVerificationKey(hre.network.name)
  const verifier = m.contract("Groth16Verifier", [verificationKey], {
    from: deployer,
  })

  const testVerifier = m.contract("TestVerifier", [], {
    from: deployer,
  })

  return { verifier, testVerifier }
})
