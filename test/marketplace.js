const { advanceTimeTo } = require("./evm")
const { slotId } = require("./ids")

async function waitUntilCancelled(expiry) {
  await advanceTimeTo(expiry + 1)
}

async function waitUntilStarted(contract, numSlots, requestId, proof) {
  const lastSlot = numSlots - 1
  for (let i = 0; i <= lastSlot; i++) {
    await contract.fillSlot(requestId, i, proof)
  }
}

async function waitUntilFinished(contract, slotId) {
  const end = (await contract.proofEnd(slotId)).toNumber()
  await advanceTimeTo(end + 1)
}

async function waitUntilFailed(contract, slot, maxSlotLoss) {
  for (let i = 0; i <= maxSlotLoss; i++) {
    slot.index = i
    let id = slotId(slot)
    await contract.freeSlot(id)
  }
}

module.exports = {
  waitUntilCancelled,
  waitUntilStarted,
  waitUntilFinished,
  waitUntilFailed,
}
