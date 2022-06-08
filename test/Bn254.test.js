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
    let fRes = await bn254.f()
    console.log("f result: ")
    console.log(JSON.stringify(fRes, null, 2))
    expect(await bn254.f()).to.be.true
  })

  it("adding point to negation of itself should be zero", async function () {
    expect(await bn254.g()).to.be.true
  })

  it("fails when first point is not on Bn254 curve", async function () {
    let proof = {
      q: [
        { i: -1, v: 1 },
        { i: -2, v: 2 },
        { i: -3, v: 3 },
      ],
      mus: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0],
      sigma: { x: 1, y: 2 },
      u: [
        { x: 1, y: 2 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
      ],
      name: ethers.utils.toUtf8Bytes("test"),
      publicKey: {
        x: [1, 2],
        y: [1, 2],
      },
    }
    await expect(bn254.verifyProof(proof)).to.be.revertedWith(
      "elliptic curve multiplication failed"
    )
  })

  // it("points should be paired correctly", async function () {
  //   expect(await bn254.pair()).to.be.true
  // })

  // it("can verify proof", async function () {
  //   let result = await bn254.verifyTx()
  //   console.log("verify result: " + JSON.stringify(result, null, 2))
  //   expect(await bn254.verifyTx()).to.be.true
  // })
})
