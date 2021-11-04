const { ethers } = require("hardhat")

const exampleRequest = () => ({
  duration: 150, // 150 blocks ≈ half an hour
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
