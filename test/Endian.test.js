const { expect } = require("chai")
const { ethers } = require("hardhat")

describe("Endian", function () {
  const big = "0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
  const little = "0x1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100"

  let endian

  beforeEach(async function () {
    let Endian = await ethers.getContractFactory("TestEndian")
    endian = await Endian.deploy()
  })

  it("converts from little endian to big endian", async function () {
    expect(await endian.byteSwap(little)).to.equal(big)
  })

  it("converts from big endian to little endian", async function () {
    expect(await endian.byteSwap(big)).to.equal(little)
  })
})
