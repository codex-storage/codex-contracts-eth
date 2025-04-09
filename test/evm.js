const {
  time,
  mine,
  takeSnapshot,
} = require("@nomicfoundation/hardhat-network-helpers")

const snapshots = []

async function snapshot() {
  const snapshot = await takeSnapshot()
  snapshots.push(snapshot)
}

async function revert() {
  const snapshot = snapshots.pop()
  if (snapshot) {
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
  mine,
  ensureMinimumBlockHeight,
  currentTime,
  advanceTime,
  advanceTimeTo,
  setNextBlockTimestamp,
}
