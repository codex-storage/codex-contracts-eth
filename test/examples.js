const { ethers } = require("hardhat")

const examples = () => ({
  duration: 31 * 24 * 60 * 60, // 31 days
  size: 1 * 1024 * 1024 * 1024, // 1 Gigabyte
  contentHash: ethers.utils.sha256("0xdeadbeef"),
  proofPeriod: 8, // 8 blocks ≈ 2 minutes
  proofTimeout: 4, // 4 blocks ≈ 1 minute
  price: 42,
  nonce: ethers.utils.randomBytes(32),
  bidExpiry: Math.round(Date.now() / 1000) + 60 * 60 // 1 hour from now
})

module.exports = { examples }
