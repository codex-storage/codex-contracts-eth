const hours = (amount) => amount * minutes(60)
const minutes = (amount) => amount * seconds(60)
const seconds = (amount) => amount

const periodic = (length) => ({
  periodOf: (timestamp) => Math.floor(timestamp / length),
  periodStart: (period) => period * length,
  periodEnd: (period) => (period + 1) * length,
})

module.exports = { hours, minutes, seconds, periodic }
