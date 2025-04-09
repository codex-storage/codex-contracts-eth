const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")

module.exports = buildModule("Periods", (m) => {
  const deployer = m.getAccount(0)
  const secondsPerPeriod = m.getParameter("secondsPerPeriod", 0)

  const periods = m.contract("Periods", [secondsPerPeriod], {
    from: deployer,
  })

  return { periods }
})
