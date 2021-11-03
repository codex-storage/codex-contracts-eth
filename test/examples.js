const { ethers } = require("hardhat")

const exampleRequest = () => ({
  duration: 200000, // 200,000 blocks ≈ 1 month
  size: 1 * 1024 * 1024 * 1024, // 1 Gigabyte
  contentHash: ethers.utils.sha256("0xdeadbeef"),
  proofPeriod: 8, // 8 blocks ≈ 2 minutes
  proofTimeout: 4, // 4 blocks ≈ 1 minute
  nonce: ethers.utils.randomBytes(32)
})

const exampleBid = () => ({
  price: 42,
  bidExpiry: Math.round(Date.now() / 1000) + 60 * 60 // 1 hour from now
})

module.exports = { exampleRequest, exampleBid }
