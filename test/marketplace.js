const { advanceTimeTo, currentTime } = require("./evm")
const { slotId, requestId } = require("./ids")
const { payoutForDuration } = require("./price")
const { collateralPerSlot } = require("./collateral")

async function waitUntilCancelled(contract, request) {
  const expiry = await contract.requestExpiry(requestId(request))
  // We do +1, because the expiry check in contract is done as `>` and not `>=`.
  return advanceTimeTo(expiry + 1n)
}

async function waitUntilSlotsFilled(contract, request, proof, token, slots) {
  let collateral = collateralPerSlot(request)
  await token.approve(await contract.getAddress(), collateral * slots.length)

  let requestEnd = await contract.requestEnd(requestId(request))
  const payouts = []
  for (let slotIndex of slots) {
    await contract.reserveSlot(requestId(request), slotIndex)
    await contract.fillSlot(requestId(request), slotIndex, proof)

    payouts[slotIndex] = payoutForDuration(
      request,
      await currentTime(),
      requestEnd
    )
  }

  return payouts
}

async function waitUntilStarted(contract, request, proof, token) {
  return waitUntilSlotsFilled(
    contract,
    request,
    proof,
    token,
    Array.from({ length: request.ask.slots }, (_, i) => i)
  )
}

async function waitUntilFinished(contract, requestId) {
  const end = await contract.requestEnd(requestId)
  // We do +1, because the end check in contract is done as `>` and not `>=`.
  await advanceTimeTo(end + 1n)
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

function patchOverloads(contract) {
  contract.freeSlot = async (slotId, rewardRecipient, collateralRecipient) => {
    const logicalXor = (a, b) => (a || b) && !(a && b)
    if (logicalXor(rewardRecipient, collateralRecipient)) {
      // XOR, if exactly one is truthy
      throw new Error(
        "Invalid freeSlot overload, you must specify both `rewardRecipient` and `collateralRecipient` or neither."
      )
    }

    if (!rewardRecipient && !collateralRecipient) {
      // calls `freeSlot` overload without `rewardRecipient` and `collateralRecipient`
      const fn = contract["freeSlot(bytes32)"]
      return await fn(slotId)
    }

    const fn = contract["freeSlot(bytes32,address,address)"]
    return await fn(slotId, rewardRecipient, collateralRecipient)
  }
  contract.withdrawFunds = async (requestId, withdrawRecipient) => {
    if (!withdrawRecipient) {
      // calls `withdrawFunds` overload without `withdrawRecipient`
      const fn = contract["withdrawFunds(bytes32)"]
      return await fn(requestId)
    }
    const fn = contract["withdrawFunds(bytes32,address)"]
    return await fn(requestId, withdrawRecipient)
  }
}

function littleEndianToBigInt(littleEndian) {
  const buffer = Buffer.from(littleEndian)
  return BigInt(`0x${buffer.toString("hex")}`)
}

module.exports = {
  waitUntilCancelled,
  waitUntilStarted,
  waitUntilSlotsFilled,
  waitUntilFinished,
  waitUntilFailed,
  waitUntilSlotFailed,
  patchOverloads,
  littleEndianToBigInt,
}
