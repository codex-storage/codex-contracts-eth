const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")

module.exports = buildModule("Periods", (m) => {
  const deployer = m.getAccount(0)
  const secondsPerPeriod = m.getParameter("secondsPerPeriod", 0)

  const periods = m.contract("TestPeriods", [], {
    from: deployer,
  })

  m.call(periods, "initialize", [secondsPerPeriod]);

  return { periods }
})
