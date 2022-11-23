const { advanceTimeTo } = require("./evm")
const { slotId, requestId } = require("./ids")

async function waitUntilCancelled(request) {
  await advanceTimeTo(request.expiry + 1)
}

async function waitUntilStarted(contract, request, proof) {
  for (let i = 0; i < request.ask.slots; i++) {
    await contract.fillSlot(requestId(request), i, proof)
  }
}

async function waitUntilFinished(contract, requestId) {
  const end = (await contract.requestEnd(requestId)).toNumber()
  await advanceTimeTo(end + 1)
}

async function waitUntilFailed(contract, request, slot) {
  for (let i = 0; i <= request.ask.maxSlotLoss; i++) {
    slot.index = i
    let id = slotId(slot)
    await contract.forciblyFreeSlot(id)
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
