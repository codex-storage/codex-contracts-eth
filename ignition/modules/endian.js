const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")

module.exports = buildModule("Endian", (m) => {
  const endian = m.contract("Endian", [], {})

  const testEndian = m.contract("TestEndian", [], {})

  return { endian, testEndian }
})
