const fs = require("fs")

const BASE_PATH = __dirname + "/networks"

const DEFAULT_CONFIGURATION = {
  collateral: {
    repairRewardPercentage: 10,
    maxNumberOfSlashes: 2,
    slashPercentage: 20,
    validatorRewardPercentage: 20, // percentage of the slashed amount going to the validators
  },
  proofs: {
    // period has to be less than downtime * blocktime
    period: 120, // seconds
    timeout: 30, // seconds
    downtime: 64, // number of blocks
    downtimeProduct: 67, // number of blocks
  },
  reservations: {
    maxReservations: 3,
  },
}

function loadConfiguration(name) {
  const path = `${BASE_PATH}/${name}/configuration.js`
  if (fs.existsSync(path)) {
    return require(path)
  } else {
    return DEFAULT_CONFIGURATION
  }
}

module.exports = { loadConfiguration }
