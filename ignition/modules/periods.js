const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")

module.exports = buildModule("Periods", (m) => {
  const secondsPerPeriod = m.getParameter("secondsPerPeriod", 0)
  const periods = m.contract("TestPeriods", [])

  m.call(periods, "initialize", [secondsPerPeriod]);

  return { periods }
})
