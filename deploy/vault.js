async function deployVault({ deployments, getNamedAccounts }) {
  const token = await deployments.get("TestToken")
  const args = [token.address]
  const { deployer: from } = await getNamedAccounts()
  await deployments.deploy("Vault", { args, from })
}

module.exports = async (environment) => {
  await deployVault(environment)
}

module.exports.tags = ["Vault"]
module.exports.dependencies = ["TestToken"]
