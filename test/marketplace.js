const { advanceTimeTo } = require("./evm")
const { slotId } = require("./ids")

async function waitUntilCancelled(request) {
  await advanceTimeTo(request.expiry + 1)
}

async function waitUntilStarted(contract, request, slot, proof) {
  const lastSlotIdx = request.ask.slots - 1
  for (let i = 0; i <= lastSlotIdx; i++) {
    await contract.fillSlot(slot.request, i, proof)
  }
  return { ...slot, index: lastSlotIdx }
}

async function waitUntilFinished(contract, lastSlot) {
  const lastSlotId = slotId(lastSlot)
  const end = (await contract.proofEnd(lastSlotId)).toNumber()
  await advanceTimeTo(end + 1)
}

async function waitUntilFailed(contract, request, slot) {
  for (let i = 0; i <= request.ask.maxSlotLoss; i++) {
    slot.index = i
    let id = slotId(slot)
    await contract.freeSlot(id)
  }
}

const RequestState = {
  New: 0,
  Started: 1,
  Cancelled: 2,
  Finished: 3,
  Failed: 4,
}

module.exports = {
  waitUntilCancelled,
  waitUntilStarted,
  waitUntilFinished,
  waitUntilFailed,
  RequestState,
}
