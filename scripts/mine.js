const { mine } = require("@nomicfoundation/hardhat-network-helpers")

async function main() {
  await mine(256)
}

main().catch(console.error)
