function pricePerSlotPerSecond(request) {
  return request.ask.pricePerBytePerSecond * request.ask.slotSize
}

function maxPrice(request) {
  return (
    request.ask.slots * request.ask.duration * pricePerSlotPerSecond(request)
  )
}

function payoutForDuration(request, start, end) {
  return (end - start) * pricePerSlotPerSecond(request)
}

module.exports = { maxPrice, pricePerSlotPerSecond, payoutForDuration }
