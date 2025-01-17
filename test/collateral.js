function collateralPerSlot(request) {
  return request.ask.collateralPerByte * request.ask.slotSize
}

module.exports = { collateralPerSlot }
