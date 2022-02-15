const now = () => Math.round(Date.now() / 1000)
const hours = (amount) => amount * minutes(60)
const minutes = (amount) => amount * seconds(60)
const seconds = (amount) => amount

module.exports = { now, hours, minutes, seconds }
