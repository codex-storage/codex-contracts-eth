const { loadZkeyHash } = require("../verifier/verifier.js")
const { loadConfiguration } = require("../configuration/configuration.js")

async function mine256blocks({ network, ethers }) {
  if (network.tags.local) {
    await ethers.provider.send("hardhat_mine", ["0x100"])
  }
}

// deploys a marketplace with a real Groth16 verifier
async function deployMarketplace({ deployments, getNamedAccounts }) {
  const vault = await deployments.get("Vault")
  const verifier = await deployments.get("Groth16Verifier")
  const zkeyHash = loadZkeyHash(network.name)
  let configuration = loadConfiguration(network.name)
  configuration.proofs.zkeyHash = zkeyHash
  const args = [configuration, vault.address, verifier.address]
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
    const vault = await deployments.get("Vault")
    const verifier = await deployments.get("TestVerifier")
    const zkeyHash = loadZkeyHash(network.name)
    let configuration = loadConfiguration(network.name)
    configuration.proofs.zkeyHash = zkeyHash
    const args = [configuration, vault.address, verifier.address]
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
module.exports.dependencies = ["Vault", "Verifier"]
