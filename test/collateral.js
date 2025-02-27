function collateralPerSlot(request) {
  return request.ask.collateralPerByte * request.ask.slotSize
}

function repairReward(configuration, collateral) {
  const percentage = configuration.collateral.repairRewardPercentage
  return Math.round((collateral * percentage) / 100)
}

module.exports = { collateralPerSlot, repairReward }
