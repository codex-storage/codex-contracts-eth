const { ethers } = require("hardhat")
const { now, hours } = require("./time")
const { sha256, hexlify, randomBytes } = ethers.utils

const exampleRequest = () => ({
  duration: 150, // 150 blocks ≈ half an hour
  size: 1 * 1024 * 1024 * 1024, // 1 Gigabyte
  contentHash: sha256("0xdeadbeef"),
  proofPeriod: 8, // 8 blocks ≈ 2 minutes
  proofTimeout: 4, // 4 blocks ≈ 1 minute
  maxPrice: 42,
  nonce: hexlify(randomBytes(32)),
})

const exampleBid = () => ({
  price: 42,
  bidExpiry: now() + hours(1),
})

const exampleLock = () => ({
  id: hexlify(randomBytes(32)),
  expiry: now() + hours(1),
})

module.exports = { exampleRequest, exampleBid, exampleLock }
