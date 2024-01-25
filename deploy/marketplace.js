const { loadZkeyHash } = require("../verifier/verifier.js")

// hardcoded addresses when deploying on local network
const MARKETPLACE_REAL = "0x59b670e9fA9D0A427751Af201D676719a970857b"
const MARKETPLACE_TEST = "0xfacadee9fA9D0A427751Af201D676719a9facade"

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

async function aliasContract(address, alias) {
  if (address !== alias) {
    await ethers.provider.send("hardhat_setCode", [alias, address])
  }
}

// deploys a marketplace with a real Groth16 verifier
async function deployMarketplace({ network, deployments, getNamedAccounts }) {
  const token = await deployments.get("TestToken")
  const verifier = await deployments.get("Groth16Verifier")
  const zkeyHash = loadZkeyHash(network.name)
  const configuration = { ...CONFIGURATION, zkeyHash }
  const args = [configuration, token.address, verifier.address]
  const { deployer: from } = await getNamedAccounts()
  const marketplace = await deployments.deploy("Marketplace", { args, from })
  if (network.tags.local) {
    await aliasContract(marketplace.address, MARKETPLACE_REAL)
  }
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
    await aliasContract(marketplace.address, MARKETPLACE_TEST)
  }
}

module.exports = async (environment) => {
  await mine256blocks(environment)
  await deployMarketplace(environment)
  await deployTestMarketplace(environment)
}

module.exports.tags = ["Marketplace"]
module.exports.dependencies = ["TestToken", "Verifier"]
