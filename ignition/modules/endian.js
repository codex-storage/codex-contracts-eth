const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")

module.exports = buildModule("Endian", (m) => {
  const deployer = m.getAccount(0)

  const endian = m.contract("Endian", [], {
    from: deployer,
  })

  const testEndian = m.contract("TestEndian", [], {
    from: deployer,
  })

  return { endian, testEndian }
})
