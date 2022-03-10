const { ethers } = require("hardhat")
const { now, hours } = require("./time")
const { sha256, hexlify, randomBytes } = ethers.utils

const exampleRequest = () => ({
  client: hexlify(randomBytes(20)),
  duration: hours(10),
  size: 1 * 1024 * 1024 * 1024, // 1 Gigabyte
  contentHash: sha256("0xdeadbeef"),
  proofProbability: 4, // require a proof roughly once every 4 periods
  maxPrice: 84,
  expiry: now() + hours(1),
  nonce: hexlify(randomBytes(32)),
})

const exampleBid = () => ({
  price: 42,
  bidExpiry: now() + hours(1),
})

const exampleOffer = () => ({
  requestId: hexlify(randomBytes(32)),
  host: hexlify(randomBytes(20)),
  price: 42,
  expiry: now() + hours(1),
})

const exampleLock = () => ({
  id: hexlify(randomBytes(32)),
  expiry: now() + hours(1),
})

module.exports = { exampleRequest, exampleOffer, exampleBid, exampleLock }
