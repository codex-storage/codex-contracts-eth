module.exports = {
  collateral: {
    repairRewardPercentage: 10,
    maxNumberOfSlashes: 2,
    slashPercentage: 20,
    validatorRewardPercentage: 20, // percentage of the slashed amount going to the validators
  },
  proofs: {
    // period has to be less than downtime * blocktime
    // blocktime can be 1 second with hardhat in automine mode
    period: 120, // seconds
    timeout: 30, // seconds
    downtime: 144, // number of blocks
    downtimeProduct: 149, // number of blocks
    zkeyHash: "",
  },
  reservations: {
    maxReservations: 3,
  },
  requestDurationLimit: 60 * 60 * 24 * 30, // 30 days
}
