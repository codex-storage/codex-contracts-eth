module.exports = {
  collateral: {
    repairRewardPercentage: 10,
    maxNumberOfSlashes: 2,
    slashCriterion: 2,
    slashPercentage: 20,
  },
  proofs: {
    // period has to be less than downtime * blocktime
    // blocktime can be 1 second with hardhat in automine mode
    period: 60, // seconds
    timeout: 30, // seconds
    downtime: 64, // number of blocks
    downtimeProduct: 67 // number of blocks
  },
  reservations: {
    maxReservations: 3
  }
}
