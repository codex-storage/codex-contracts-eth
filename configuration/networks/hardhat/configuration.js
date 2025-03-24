module.exports = {
  collateral: {
    repairRewardPercentage: 10,
    maxNumberOfSlashes: 2,
    slashPercentage: 20,
    validatorRewardPercentage: 20, // percentage of the slashed amount going to the validators
    protocolFeePermille: 5, // dictates how much of the request price (defined by its ask) should go to protocol fee that is burned; specified in a per mille
  },
  proofs: {
    // period has to be less than downtime * blocktime
    // blocktime can be 1 second with hardhat in automine mode
    period: 90, // seconds
    timeout: 30, // seconds
    downtime: 96, // number of blocks
    downtimeProduct: 97, // number of blocks
    zkeyHash: "",
  },
  reservations: {
    maxReservations: 3,
  },
  requestDurationLimit: 60*60*24*30 // 30 days
}
