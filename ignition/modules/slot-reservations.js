const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")

module.exports = buildModule("SlotReservations", (m) => {
  const deployer = m.getAccount(0)

  const configuration = m.getParameter("configuration", null)

  const testSlotReservations = m.contract(
    "TestSlotReservations",
    [],
    {
      from: deployer,
    }
  )

  m.call(testSlotReservations, "initialize", [configuration]);
  
  return { testSlotReservations }
})
