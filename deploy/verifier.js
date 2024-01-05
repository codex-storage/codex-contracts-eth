
module.exports = async ({ deployments, getNamedAccounts }) => {
  const { deployer } = await getNamedAccounts()

  // TODO: Add logic to deploy specific version of verifier based on the network: network.tags....
  // The `contract: ...` part allows to fully specify the contract to be
  // deployed even if they are with the same names.
  await deployments.deploy("Verifier", { from: deployer, contract: "contracts/verifiers/testing/verifier.sol:Groth16Verifier" })
}

module.exports.tags = ["Verifier"]
