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
  await ethers.provider.send("evm_setNextBlockTimestamp", [time])
}

async function mine() {
  await ethers.provider.send("evm_mine")
}

async function ensureMinimumBlockHeight(height) {
  while ((await ethers.provider.getBlockNumber()) < height) {
    await mine()
  }
}

async function currentTime() {
  let block = await ethers.provider.getBlock("latest")
  return block.timestamp
}

async function advanceTime(seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds])
  await mine()
}

async function advanceTimeTo(timestamp) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp])
  await mine()
}

module.exports = {
  snapshot,
  revert,
  mine,
  ensureMinimumBlockHeight,
  currentTime,
  advanceTime,
  advanceTimeTo,
}
