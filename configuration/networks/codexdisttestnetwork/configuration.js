function asNumber(value) {
  return parseInt(value);
}

module.exports = {
  collateral: {
    repairRewardPercentage: asNumber(process.env.DISTTEST_REPAIRREWARD),
    maxNumberOfSlashes: asNumber(process.env.DISTTEST_MAXSLASHES),
    slashPercentage: asNumber(process.env.DISTTEST_SLASHPERCENTAGE),
    validatorRewardPercentage: asNumber(process.env.DISTTEST_VALIDATORREWARD),
  },
  proofs: {
    period: asNumber(process.env.DISTTEST_PERIOD),
    timeout: asNumber(process.env.DISTTEST_TIMEOUT),
    downtime: asNumber(process.env.DISTTEST_DOWNTIME),
    downtimeProduct: asNumber(process.env.DISTTEST_DOWNTIMEPRODUCT),
    zkeyHash: "",
  },
  reservations: {
    maxReservations: asNumber(process.env.DISTTEST_MAXRESERVATIONS),
  },
  requestDurationLimit: asNumber(process.env.DISTTEST_MAXDURATION)
}
