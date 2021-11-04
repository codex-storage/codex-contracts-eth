const { ethers } = require("hardhat")

async function mineBlock() {
  await ethers.provider.send("evm_mine")
}

async function minedBlockNumber() {
  return await ethers.provider.getBlockNumber()
}

module.exports = { mineBlock, minedBlockNumber }
