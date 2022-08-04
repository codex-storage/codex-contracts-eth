async function waitUntilExpired(expiry) {
  await ethers.provider.send("hardhat_mine", [ethers.utils.hexValue(expiry)])
}

module.exports = { waitUntilExpired }
