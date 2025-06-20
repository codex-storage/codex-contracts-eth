const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")

module.exports = buildModule("SlotReservations", (m) => {
  const configuration = m.getParameter("configuration", null)

  const testSlotReservations = m.contract(
    "TestSlotReservations",
    [configuration],
    {},
  )

  return { testSlotReservations }
})
