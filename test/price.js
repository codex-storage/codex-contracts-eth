function price(request) {
  return request.ask.slots * pricePerSlot(request)
}

function pricePerSlot(request) {
  return request.ask.duration * request.ask.reward
}

module.exports = { price, pricePerSlot }
