const {
  time,
  mine,
  takeSnapshot,
  setNextBlockTimestamp,
} = require("@nomicfoundation/hardhat-network-helpers")

const snapshots = []

async function snapshot() {
  const snapshot = await takeSnapshot()
  const automine = await ethers.provider.send("hardhat_getAutomine")
  const time = await currentTime()
  snapshots.push({ snapshot, automine, time })
}

async function revert() {
  const { snapshot, time, automine } = snapshots.pop()
  if (snapshot) {
    setNextBlockTimestamp(time)
    await ethers.provider.send("evm_setAutomine", [automine])
    return snapshot.restore()
  }
}

async function ensureMinimumBlockHeight(height) {
  while ((await time.latestBlock()) < height) {
    await mine()
  }
}

async function setNextBlockTimestamp(timestamp) {
  return time.setNextBlockTimestamp(timestamp)
}

async function currentTime() {
  return time.latest()
}

async function advanceTime(seconds) {
  await time.increase(seconds)
  await mine()
}

async function advanceTimeTo(timestamp) {
  await time.setNextBlockTimestamp(timestamp)
  await mine()
}

module.exports = {
  snapshot,
  revert,
  setAutomine,
  mine,
  ensureMinimumBlockHeight,
  currentTime,
  advanceTime,
  advanceTimeTo,
  setNextBlockTimestamp,
}
