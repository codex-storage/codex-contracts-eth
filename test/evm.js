const {
  time,
  mine,
  takeSnapshot,
} = require("@nomicfoundation/hardhat-network-helpers")
const hre = require("hardhat")
const provider = hre.network.provider

const snapshots = []

async function snapshot() {
  const snapshot = await takeSnapshot()
  const time = await currentTime()
  const automine = await provider.send("hardhat_getAutomine")
  snapshots.push({ snapshot, automine, time })
}

async function revert() {
  const { snapshot, time, automine } = snapshots.pop()
  if (snapshot) {
    await snapshot.restore()
    await setNextBlockTimestamp(time)
    await provider.send("evm_setAutomine", [automine])
  }
}

async function setAutomine(enabled) {
  await provider.send("evm_setAutomine", [enabled])
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
