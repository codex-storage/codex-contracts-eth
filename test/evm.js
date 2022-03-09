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

async function ensureMinimumBlockHeight(height) {
  while ((await ethers.provider.getBlockNumber()) < height) {
    await ethers.provider.send("evm_mine")
  }
}

async function currentTime() {
  let block = await ethers.provider.getBlock("latest")
  return block.timestamp
}

async function advanceTime(seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds])
  await ethers.provider.send("evm_mine")
}

async function advanceTimeTo(timestamp) {
  if ((await currentTime()) !== timestamp) {
    await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp])
    await ethers.provider.send("evm_mine")
  }
}

module.exports = {
  snapshot,
  revert,
  ensureMinimumBlockHeight,
  currentTime,
  advanceTime,
  advanceTimeTo,
}
