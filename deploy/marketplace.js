const { loadZkeyHash } = require("../verifier/verifier.js")

// marketplace configuration
const CONFIGURATION = {
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

async function mine256blocks({ network, ethers }) {
  if (network.tags.local) {
    await ethers.provider.send("hardhat_mine", ["0x100"])
  }
}

// deploys a marketplace with a real Groth16 verifier
async function deployMarketplace({ deployments, getNamedAccounts }) {
  const token = await deployments.get("TestToken")
  const verifier = await deployments.get("Groth16Verifier")
  const zkeyHash = loadZkeyHash(network.name)
  const configuration = { ...CONFIGURATION, zkeyHash }
  const args = [configuration, token.address, verifier.address]
  const { deployer: from } = await getNamedAccounts()
  const marketplace = await deployments.deploy("Marketplace", { args, from })
  console.log("Deployed Marketplace with Groth16 Verifier at:")
  console.log(marketplace.address)
  console.log()
}

// deploys a marketplace with a testing verifier
async function deployTestMarketplace({
  network,
  deployments,
  getNamedAccounts,
}) {
  if (network.tags.local) {
    const token = await deployments.get("TestToken")
    const verifier = await deployments.get("TestVerifier")
    const zkeyHash = loadZkeyHash(network.name)
    const configuration = { ...CONFIGURATION, zkeyHash }
    const args = [configuration, token.address, verifier.address]
    const { deployer: from } = await getNamedAccounts()
    const marketplace = await deployments.deploy("Marketplace", { args, from })
    console.log("Deployed Marketplace with Test Verifier at:")
    console.log(marketplace.address)
    console.log()
  }
}

module.exports = async (environment) => {
  await mine256blocks(environment)
  await deployMarketplace(environment)
  await deployTestMarketplace(environment)
}

module.exports.tags = ["Marketplace"]
module.exports.dependencies = ["TestToken", "Verifier"]
