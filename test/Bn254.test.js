const { expect } = require("chai")
const { ethers } = require("hardhat")
const {
  snapshot,
  revert,
  ensureMinimumBlockHeight,
  currentTime,
  advanceTime,
  advanceTimeTo,
} = require("./evm")
const { periodic } = require("./time")

describe("Bn254", function () {
  let bn254

  beforeEach(async function () {
    await snapshot()
    await ensureMinimumBlockHeight(256)
    const Bn254 = await ethers.getContractFactory("TestBn254")
    bn254 = await Bn254.deploy()
  })

  afterEach(async function () {
    await revert()
  })

  it("explicit sum and scalar prod are the same", async function () {
    expect(await bn254.f()).to.be.true
  })

  it("adding point to negation of itself should be zero", async function () {
    expect(await bn254.g()).to.be.true
  })

  it("multiplication along BN254 emits expected values", async function () {
    expect(await bn254.testMul()).to.be.true
  })
})
