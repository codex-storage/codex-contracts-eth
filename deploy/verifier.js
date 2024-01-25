const { loadVerificationKey } = require("../verifier/verifier.js")

async function deployVerifier({ deployments, getNamedAccounts }) {
  const { deployer } = await getNamedAccounts()
  const verificationKey = loadVerificationKey(network.name)
  await deployments.deploy("Groth16Verifier", {
    args: [verificationKey],
    from: deployer,
  })
}

async function deployTestVerifier({ network, deployments, getNamedAccounts }) {
  if (network.tags.local) {
    const { deployer } = await getNamedAccounts()
    await deployments.deploy("TestVerifier", { from: deployer })
  }
}

module.exports = async (environment) => {
  await deployVerifier(environment)
  await deployTestVerifier(environment)
}

module.exports.tags = ["Verifier"]
