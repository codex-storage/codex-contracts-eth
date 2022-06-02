const { expect } = require("chai")
const { ethers } = require("hardhat")
const {
  snapshot,
  revert,
  ensureMinimumBlockHeight,
  advanceTime,
} = require("./evm")

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

  it("points should be paired correctly", async function () {
    expect(await bn254.pair()).to.be.true
  })

  it("can verify proof", async function () {
    let result = await bn254.verifyTx()
    console.log("verify result: " + JSON.stringify(result, null, 2))
    expect(await bn254.verifyTx()).to.be.true
  })
})
