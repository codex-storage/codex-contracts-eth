const { ethers } = require("hardhat")
const { hours } = require("./time")
const { currentTime } = require("./evm")
const { hexlify, randomBytes } = ethers.utils

const exampleConfiguration = () => ({
  collateral: {
    repairRewardPercentage: 10,
    maxNumberOfSlashes: 5,
    slashCriterion: 3,
    slashPercentage: 10,
  },
  proofs: {
    period: 10,
    timeout: 5,
    downtime: 64,
  },
})

const exampleRequest = async () => {
  const now = await currentTime()
  return {
    client: hexlify(randomBytes(20)),
    ask: {
      slots: 4,
      slotSize: 1 * 1024 * 1024 * 1024, // 1 Gigabyte
      duration: hours(10),
      proofProbability: 4, // require a proof roughly once every 4 periods
      reward: 84,
      maxSlotLoss: 2,
      collateral: 200,
    },
    content: {
      cid: "zb2rhheVmk3bLks5MgzTqyznLu1zqGH5jrfTA1eAZXrjx7Vob",
      merkleRoot: Array.from(randomBytes(32))
    },
    expiry: now + hours(1),
    nonce: hexlify(randomBytes(32)),
  }
}

module.exports = { exampleConfiguration, exampleRequest }
