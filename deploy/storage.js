async function deployStorage({ deployments, getNamedAccounts }) {
  const token = await deployments.get("TestToken")
  const proofPeriod = 10
  const proofTimeout = 5
  const proofDowntime = 64
  const collateralAmount = 100
  const slashMisses = 3
  const slashPercentage = 10
  const args = [
    token.address,
    proofPeriod,
    proofTimeout,
    proofDowntime,
    collateralAmount,
    slashMisses,
    slashPercentage,
  ]
  const { deployer } = await getNamedAccounts()
  await deployments.deploy("Storage", { args, from: deployer })
}

async function mine256blocks({ network, ethers }) {
  if (network.tags.local) {
    await ethers.provider.send("hardhat_mine", ["0x100"])
  }
}

module.exports = async (environment) => {
  await mine256blocks(environment)
  await deployStorage(environment)
}

module.exports.tags = ["Storage"]
module.exports.dependencies = ["TestToken"]
