const { advanceTimeToForNextBlock, currentTime } = require("./evm")
const { slotId, requestId } = require("./ids")
const { price } = require("./price")

/**
 * @dev This will not advance the time right on the "expiry threshold" but will most probably "overshoot it"
 *      because "currentTime" most probably is not the time at which the request is created, but it is used
 *      in the next timestamp calculation with `now + expiry`.
 * @param request
 * @returns {Promise<void>}
 */
async function waitUntilCancelled(request) {
  // We do +1, because the expiry check in contract is done as `>` and not `>=`.
  await advanceTimeToForNextBlock((await currentTime()) + request.expiry + 1)
}

async function waitUntilStarted(contract, request, proof, token) {
  await token.approve(contract.address, price(request) * request.ask.slots)

  for (let i = 0; i < request.ask.slots; i++) {
    await contract.fillSlot(requestId(request), i, proof)
  }
}

async function waitUntilFinished(contract, requestId) {
  const end = (await contract.requestEnd(requestId)).toNumber()
  // We do +1, because the end check in contract is done as `>` and not `>=`.
  await advanceTimeToForNextBlock(end + 1)
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
