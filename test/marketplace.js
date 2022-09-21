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

async function waitUntilAllSlotsFilled(contract, numSlots, requestId, proof) {
  for (let i = 0; i < numSlots; i++) {
    await contract.fillSlot(requestId, i, proof)
  }
}

module.exports = { waitUntilExpired, waitUntilAllSlotsFilled, RequestState }
