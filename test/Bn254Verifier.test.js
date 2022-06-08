const { expect } = require("chai")
const { ethers } = require("hardhat")
const {
  snapshot,
  revert,
  ensureMinimumBlockHeight,
  advanceTime,
} = require("./evm")

describe("Bn254Verifier", function () {
  let bn254

  beforeEach(async function () {
    await snapshot()
    await ensureMinimumBlockHeight(256)
    const Bn254Verifier = await ethers.getContractFactory("TestBn254Verifier")
    verifier = await Bn254Verifier.deploy()
  })

  afterEach(async function () {
    await revert()
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
    await expect(verifier.verifyProof(proof)).to.be.revertedWith(
      "elliptic curve multiplication failed"
    )
  })
})
