function pricePerSlotPerSecond(request) {
  return request.ask.pricePerBytePerSecond * request.ask.slotSize
}

function protocolFee(request, config) {
  let requestPrice = request.ask.slots * request.ask.duration * pricePerSlotPerSecond(request)
  return (requestPrice / 1000) * config.protocolFeePermille
}

function maxPrice(request) {
  return (
    request.ask.slots * request.ask.duration * pricePerSlotPerSecond(request)
  )
}

function maxPriceWithProtocolFee(request, config) {
  return maxPrice(request) + protocolFee(request, config)
}

function maxPriceWithProtocolFee(request, config) {
  let requestPrice = request.ask.slots * request.ask.duration * pricePerSlotPerSecond(request)
  let protocolFee = (requestPrice / 1000) * config.protocolFeePermille
  return requestPrice + protocolFee
}

function payoutForDuration(request, start, end) {
  return (end - start) * pricePerSlotPerSecond(request)
}

module.exports = { maxPrice, maxPriceWithProtocolFee, protocolFee, pricePerSlotPerSecond, payoutForDuration }
