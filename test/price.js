function maxPrice(request) {
  return request.ask.slots * request.ask.duration * request.ask.reward
}

function payoutForDuration(request, start, end) {
  return (end - start) * request.ask.reward
}

module.exports = { maxPrice, payoutForDuration }
