const RequestState = {
  New: 0,
  Started: 1,
  Cancelled: 2,
  Finished: 3,
  Failed: 4,
}

async function waitUntilExpired(expiry) {
  await ethers.provider.send("hardhat_mine", [ethers.utils.hexValue(expiry)])
}

module.exports = { waitUntilExpired, RequestState }
