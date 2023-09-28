const { advanceTimeTo, currentTime } = require("./evm")
const { slotId, requestId } = require("./ids")
const {price} = require("./price");

async function waitUntilCancelled(request) {
  await advanceTimeTo(request.expiry + 1)
}

async function waitUntilStarted(contract, request, proof, token) {
  await token.approve(contract.address, price(request)*request.ask.slots)

  for (let i = 0; i < request.ask.slots; i++) {
    await contract.fillSlot(requestId(request), i, proof)
  }
}

async function waitUntilFinished(contract, requestId) {
  const end = (await contract.requestEnd(requestId)).toNumber()
  await advanceTimeTo(end + 1)
}

async function waitUntilFailed(contract, request) {
  slot = { request: requestId(request), slot: 0 }
  for (let i = 0; i <= request.ask.maxSlotLoss; i++) {
    slot.index = i
    let id = slotId(slot)
    await contract.forciblyFreeSlot(id)
  }
}

async function waitUntilSlotFailed(contract, request, slot) {
  let index = 0
  let freed = 0
  while (freed <= request.ask.maxSlotLoss) {
    if (index !== slot.index) {
      await contract.forciblyFreeSlot(slotId({ ...slot, index }))
      freed++
    }
    index++
  }
}

module.exports = {
  waitUntilCancelled,
  waitUntilStarted,
  waitUntilFinished,
  waitUntilFailed,
  waitUntilSlotFailed,
}
