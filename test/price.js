function pricePerSlotPerSecond(request) {
  return request.ask.pricePerBytePerSecond * request.ask.slotSize
}

function maxPrice(request) {
  return (
    request.ask.slots * request.ask.duration * pricePerSlotPerSecond(request)
  )
}

function payoutForDuration(request, start, end) {
  return (Number(end) - Number(start)) * pricePerSlotPerSecond(request)
}

function calculatePartialPayout(request, expiresAt, filledAt) {
  return (Number(expiresAt) - Number(filledAt)) * pricePerSlotPerSecond(request)
}

function calculateBalance(balance, reward) {
  return BigInt(balance) + BigInt(reward)
}

module.exports = {
  maxPrice,
  pricePerSlotPerSecond,
  payoutForDuration,
  calculatePartialPayout,
  calculateBalance,
}
