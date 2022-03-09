const { ethers } = require("hardhat")

let snapshots = []

async function snapshot() {
  const id = await ethers.provider.send("evm_snapshot")
  const time = await currentTime()
  snapshots.push({ id, time })
}

async function revert() {
  const { id, time } = snapshots.pop()
  await ethers.provider.send("evm_revert", [id])
  await ethers.provider.send("evm_setNextBlockTimestamp", [time + 1])
}

async function mineBlock() {
  await ethers.provider.send("evm_mine")
}

async function minedBlockNumber() {
  return await ethers.provider.getBlockNumber()
}

async function ensureMinimumBlockHeight(height) {
  while ((await minedBlockNumber()) < height) {
    await mineBlock()
  }
}

async function currentTime() {
  let block = await ethers.provider.getBlock("latest")
  return block.timestamp
}

async function advanceTime(seconds) {
  ethers.provider.send("evm_increaseTime", [seconds])
  await mineBlock()
}

async function advanceTimeTo(timestamp) {
  if ((await currentTime()) !== timestamp) {
    ethers.provider.send("evm_setNextBlockTimestamp", [timestamp])
    await mineBlock()
  }
}

module.exports = {
  snapshot,
  revert,
  mineBlock,
  minedBlockNumber,
  ensureMinimumBlockHeight,
  currentTime,
  advanceTime,
  advanceTimeTo,
}
