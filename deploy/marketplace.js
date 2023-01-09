async function deployMarketplace({ deployments, getNamedAccounts }) {
  const token = await deployments.get("TestToken")
  const proofPeriod = 10
  const proofTimeout = 5
  const proofDowntime = 64
  const collateralAmount = 100
  const slashMisses = 3
  const slashPercentage = 10
  const minCollateralThreshold = 40
  const args = [
    token.address,
    collateralAmount,
    minCollateralThreshold,
    slashMisses,
    slashPercentage,
    proofPeriod,
    proofTimeout,
    proofDowntime,
  ]
  const { deployer } = await getNamedAccounts()
  await deployments.deploy("Marketplace", { args, from: deployer })
}

async function mine256blocks({ network, ethers }) {
  if (network.tags.local) {
    await ethers.provider.send("hardhat_mine", ["0x100"])
  }
}

module.exports = async (environment) => {
  await mine256blocks(environment)
  await deployMarketplace(environment)
}

module.exports.tags = ["Marketplace"]
module.exports.dependencies = ["TestToken"]
