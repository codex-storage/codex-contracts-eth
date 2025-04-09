const hre = require("hardhat")
const { mine } = require("@nomicfoundation/hardhat-network-helpers")

const MarketplaceModule = require("../ignition/modules/marketplace")

async function main() {
  if (hre.network.config.tags.includes("local")) {
    await mine(256)
  }

  const { marketplace, testMarketplace } = await hre.ignition.deploy(
    MarketplaceModule
  )

  console.info("Deployed Marketplace with Groth16 Verifier at:")
  console.log(await marketplace.getAddress())

  console.log()

  console.info("Deployed Marketplace with Test Verifier at:")
  console.log(await testMarketplace.getAddress())
}

main().catch(console.error)
