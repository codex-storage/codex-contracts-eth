const { ethers } = require("hardhat")
const { now, hours } = require("./time")
const { hexlify, randomBytes } = ethers.utils

const exampleRequest = () => ({
  client: hexlify(randomBytes(20)),
  ask: {
    size: 1 * 1024 * 1024 * 1024, // 1 Gigabyte
    duration: hours(10),
    proofProbability: 4, // require a proof roughly once every 4 periods
    reward: 84,
  },
  content: {
    cid: "zb2rhheVmk3bLks5MgzTqyznLu1zqGH5jrfTA1eAZXrjx7Vob",
    erasure: {
      totalChunks: 12,
      totalNodes: 4,
    },
    por: {
      u: Array.from(randomBytes(480)),
      publicKey: Array.from(randomBytes(96)),
      name: Array.from(randomBytes(512)),
    },
  },
  expiry: now() + hours(1),
  nonce: hexlify(randomBytes(32)),
})

const exampleLock = () => ({
  id: hexlify(randomBytes(32)),
  expiry: now() + hours(1),
})

module.exports = { exampleRequest, exampleLock }
