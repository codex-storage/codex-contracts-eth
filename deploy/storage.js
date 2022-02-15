module.exports = async ({ deployments, getNamedAccounts }) => {
  const token = await deployments.get("TestToken")
  const collateralAmount = 100
  const slashMisses = 3
  const slashPercentage = 10
  const args = [token.address, collateralAmount, slashMisses, slashPercentage]
  const { deployer } = await getNamedAccounts()
  await deployments.deploy("Storage", { args, from: deployer })
}

module.exports.tags = ["Storage"]
module.exports.dependencies = ["TestToken"]
