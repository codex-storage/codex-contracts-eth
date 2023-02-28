async function deployMarketplace({ deployments, getNamedAccounts }) {
  const token = await deployments.get("TestToken")
  const configuration = {
    collateral: {
      minimumAmount: 40,
      slashCriterion: 3,
      slashPercentage: 10,
    },
    proofs: {
      period: 10,
      timeout: 5,
      downtime: 64,
    },
  }
  const args = [token.address, configuration]
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
