const { ethers } = require("hardhat")
const { now, hours } = require("./time")

const exampleRequest = () => ({
  duration: 150, // 150 blocks ≈ half an hour
  size: 1 * 1024 * 1024 * 1024, // 1 Gigabyte
  contentHash: ethers.utils.sha256("0xdeadbeef"),
  proofPeriod: 8, // 8 blocks ≈ 2 minutes
  proofTimeout: 4, // 4 blocks ≈ 1 minute
  nonce: ethers.utils.randomBytes(32),
})

const exampleBid = () => ({
  price: 42,
  bidExpiry: now() + hours(1),
})

const exampleLock = () => ({
  id: ethers.utils.randomBytes(32),
  expiry: now() + hours(1),
})

module.exports = { exampleRequest, exampleBid, exampleLock }
