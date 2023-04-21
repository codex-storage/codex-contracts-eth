const MARKETPLACE_HARDCODED_ADDRESS = "0x59b670e9fA9D0A427751Af201D676719a970857b"

async function deployMarketplace({ deployments, getNamedAccounts }) {
  const token = await deployments.get("TestToken")
  const configuration = {
    collateral: {
      repairRewardPercentage: 10,
      maxNumberOfSlashes: 5,
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

async function aliasContract({deployments, network}) {
  if (network.tags.local) {
    const marketplaceDeployment = await deployments.get("Marketplace")

    if (marketplaceDeployment.address === MARKETPLACE_HARDCODED_ADDRESS) {
      console.log('Marketplace is deployed to expected address. Aborting aliasing.')
      return 
    }

    console.log(`Aliasing marketplace from address ${marketplaceDeployment.address} to ${MARKETPLACE_HARDCODED_ADDRESS}`)
    await ethers.provider.send("hardhat_setCode", [MARKETPLACE_HARDCODED_ADDRESS, marketplaceDeployment.address])
  }
}

module.exports = async (environment) => {
  await mine256blocks(environment)
  await deployMarketplace(environment)
  await aliasContract(environment)
}

module.exports.tags = ["Marketplace"]
module.exports.dependencies = ["TestToken"]
