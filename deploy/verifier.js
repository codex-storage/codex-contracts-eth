const { loadVerificationKey } = require ("../verifier/verifier.js")

module.exports = async ({ deployments, getNamedAccounts, network }) => {
  const { deployer } = await getNamedAccounts()
  const verificationKey = loadVerificationKey(network.name)
  await deployments.deploy("Groth16Verifier", { args: [verificationKey], from: deployer })
}

module.exports.tags = ["Groth16Verifier"]
