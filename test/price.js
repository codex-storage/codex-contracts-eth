function maxPrice(request) {
  return (
    request.ask.slots *
    request.ask.duration *
    request.ask.pricePerBytePerSecond *
    request.ask.slotSize
  )
}

function pricePerSlotPerSecond(request) {
  return request.ask.pricePerBytePerSecond * request.ask.slotSize
}

function payoutForDuration(request, start, end) {
  return (end - start) * pricePerSlotPerSecond(request)
}

module.exports = { maxPrice, pricePerSlotPerSecond, payoutForDuration }
