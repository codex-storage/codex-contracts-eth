const { ethers } = require("hardhat")
const { hours } = require("./time")
const { currentTime } = require("./evm")
const { getAddress, hexlify, randomBytes } = ethers.utils

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
    },
    content: {
      cid: "zb2rhheVmk3bLks5MgzTqyznLu1zqGH5jrfTA1eAZXrjx7Vob",
      erasure: {
        totalChunks: 12,
      },
      por: {
        u: Array.from(randomBytes(480)),
        publicKey: Array.from(randomBytes(96)),
        name: Array.from(randomBytes(512)),
      },
    },
    expiry: now + hours(1),
    nonce: hexlify(randomBytes(32)),
  }
}
const exampleLock = async () => {
  const now = await currentTime()
  return {
    id: hexlify(randomBytes(32)),
    expiry: now + hours(1),
  }
}
const exampleAddress = () => {
  return getAddress(hexlify(randomBytes(20)))
}
const zeroBytesHex = (bytes) => {
  let hex = "0x"
  for (let i = 0; i < bytes; i++) {
    hex += "00"
  }
  return hex
}

module.exports = { exampleRequest, exampleLock, exampleAddress, zeroBytesHex }
