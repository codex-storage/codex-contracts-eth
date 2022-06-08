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
    const p1 = { x: 1, y: 2 }
    const p2 = { x: 1, y: 2 }
    const explicitSum = await bn254.callStatic.add(p1, p2)
    const scalarProd = await bn254.callStatic.multiply(p1, 2)
    expect(explicitSum.x).to.be.equal(scalarProd.x)
    expect(explicitSum.y).to.be.equal(scalarProd.y)
  })

  it("adding point to negation of itself should be zero", async function () {
    const p1Generator = await bn254.p1Generator()
    const p1GeneratorNegated = await bn254.callStatic.negate(p1Generator)
    const result = await bn254.callStatic.add(p1Generator, p1GeneratorNegated)
    expect(result.x).to.be.equal(0)
    expect(result.y).to.be.equal(0)
  })

  it("should pair successfully", async function () {
    const p = {
      x: "0x1c76476f4def4bb94541d57ebba1193381ffa7aa76ada664dd31c16024c43f59",
      y: "0x3034dd2920f673e204fee2811c678745fc819b55d3e9d294e45c9b03a76aef41",
    }
    const q = {
      x: [
        "0x209dd15ebff5d46c4bd888e51a93cf99a7329636c63514396b4a452003a35bf7",
        "0x04bf11ca01483bfa8b34b43561848d28905960114c8ac04049af4b6315a41678",
      ],
      y: [
        "0x2bb8324af6cfc93537a2ad1a445cfd0ca2a71acd7ac41fadbf933c2a51be344d",
        "0x120a2a4cf30c1bf9845f20c6fe39e07ea2cce61f0c9bb048165fe5e4de877550",
      ],
    }
    const r = {
      x: "0x111e129f1cf1097710d41c4ac70fcdfa5ba2023c6ff1cbeac322de49d1b6df7c",
      y: "0x2032c61a830e3c17286de9462bf242fca2883585b93870a73853face6a6bf411",
    }
    const s = {
      x: [
        "0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2",
        "0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed",
      ],
      y: [
        "0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b",
        "0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa",
      ],
    }
    let paired = await bn254.callStatic.checkPairing(p, q, r, s)
    expect(paired).to.be.true
  })

  it("should fail pairing", async function () {
    const p = {
      x: "0x1c76476f4def4bb94541d57ebba1193381ffa7aa76ada664dd31c16024c43f59",
      y: "0x3034dd2920f673e204fee2811c678745fc819b55d3e9d294e45c9b03a76aef41",
    }
    const q = {
      x: [
        "0x209dd15ebff5d46c4bd888e51a93cf99a7329636c63514396b4a452003a35bf7",
        "0x04bf11ca01483bfa8b34b43561848d28905960114c8ac04049af4b6315a41678",
      ],
      y: [
        "0x2bb8324af6cfc93537a2ad1a445cfd0ca2a71acd7ac41fadbf933c2a51be344d",
        "0x120a2a4cf30c1bf9845f20c6fe39e07ea2cce61f0c9bb048165fe5e4de877550",
      ],
    }
    const r = {
      x: "0x111e129f1cf1097710d41c4ac70fcdfa5ba2023c6ff1cbeac322de49d1b6df7c",
      y: "0x103188585e2364128fe25c70558f1560f4f9350baf3959e603cc91486e110936",
    }
    const s = {
      x: [
        "0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2",
        "0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed",
      ],
      y: [
        "0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b",
        "0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa",
      ],
    }
    let paired = await bn254.callStatic.checkPairing(p, q, r, s)
    expect(paired).to.be.false
  })

  it("should create a point from a hash", async function () {
    const message = 0x73616d706c65
    const point = await bn254.hashToPoint(message)
    expect(point.x).to.be.equal(
      "0x11e028f08c500889891cc294fe758a60e84495ec1e2d0bce208c9fc67b6486fd"
    )
    expect(point.y).to.be.equal(
      "0x0d6ac4f2b04c63535037985d348588d3e2a1f3aad7c3354e583bd77a93361364"
    )
  })

  it("should validate G1 point on curve", async function () {
    const point = {
      x: "0x2243525c5efd4b9c3d3c45ac0ca3fe4dd85e830a4ce6b65fa1eeaee202839703",
      y: "0x301d1d33be6da8e509df21cc35964723180eed7532537db9ae5e7d48f195c915",
    }
    const isOnCurve = await bn254.isOnCurve(point)
    expect(isOnCurve).to.be.true
  })

  it("should not validate G1 point not on curve", async function () {
    const point = {
      x: "0x2243525c5efd4b9c3d3c45ac0ca3fe4dd85e830a4ce6b65fa1eeaee202839703",
      y: "0x301d1d33be6da8e509df21cc35964723180eed7532537db9ae5e7d48f195c916",
    }
    const isOnCurve = await bn254.isOnCurve(point)
    expect(isOnCurve).to.be.false
  })

  it("should fail proof verification when first point is not on curve", async function () {
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
    expect(bn254.callStatic.verifyProof(proof)).to.be.revertedWith(
      "elliptic curve multiplication failed"
    )
  })
})
