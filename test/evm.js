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
  if ((await currentTime()) !== timestamp) {
    // The `timestamp - 1` is there because the `mine()` advances the block timestamp by 1 second
    // so in order to get really the passed `timestamp` for next block we do `timestamp - 1`.
    await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp - 1])
    await mine()
  }
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
