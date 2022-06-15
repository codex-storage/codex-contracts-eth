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

  it("should fail proof verification with incorrect proof generation", async function () {
    let proof = {
      q: [
        { i: -1, v: 1 },
        { i: -2, v: 2 },
        { i: -3, v: 3 },
      ],
      mus: [1, 2, 3],
      sigma: { x: 111, y: 222 }, // Wrong
      u: [
        { x: 1, y: 2 },
        { x: 1, y: 2 },
        { x: 1, y: 2 },
      ],
      name: ethers.utils.toUtf8Bytes("test"),
      publicKey: {
        x: [1, 2],
        y: [1, 2],
      },
    }
    expect(bn254.callStatic.verifyProof(proof)).to.be.revertedWith(
      "proof generated incorrectly"
    )
  })

  it("should fail proof verification with incorrect key generation", async function () {
    let proof = {
      q: [
        { i: -1, v: 1 },
        { i: -2, v: 2 },
        { i: -3, v: 3 },
      ],
      mus: [1, 2, 3],
      sigma: { x: 1, y: 2 },
      u: [
        { x: 1, y: 2 },
        { x: 1, y: 2 },
        { x: 1, y: 2 },
      ],
      name: ethers.utils.toUtf8Bytes("test"),
      publicKey: {
        // Wrong
        x: [1, 2],
        y: [1, 2],
      },
    }
    expect(bn254.callStatic.verifyProof(proof)).to.be.revertedWith(
      "public key not on Bn254 curve"
    )
  })

  it("should fail proof verification with incorrect proof name", async function () {
    let proof = {
      q: [
        { i: -1, v: 1 },
        { i: -2, v: 2 },
        { i: -3, v: 3 },
      ],
      mus: [1, 2, 3],
      sigma: { x: 1, y: 2 },
      u: [
        { x: 1, y: 2 },
        { x: 1, y: 2 },
        { x: 1, y: 2 },
      ],
      name: ethers.utils.toUtf8Bytes(""), // Wrong
      publicKey: {
        x: [111, 222],
        y: [1, 2],
      },
    }
    expect(bn254.callStatic.verifyProof(proof)).to.be.revertedWith(
      "proof name must be provided"
    )
  })

  it("should fail proof verification with incorrect setup", async function () {
    let proof = {
      q: [
        { i: -1, v: 1 },
        { i: -2, v: 2 },
        { i: -3, v: 3 },
      ],
      mus: [1, 2, 3],
      sigma: { x: 1, y: 2 },
      u: [
        { x: 111, y: 222 }, // Wrong
        { x: 1, y: 2 },
        { x: 1, y: 2 },
      ],
      name: ethers.utils.toUtf8Bytes("test"),
      publicKey: {
        x: [1, 2],
        y: [1, 2],
      },
    }
    expect(bn254.callStatic.verifyProof(proof)).to.be.revertedWith(
      "incorrect proof setup"
    )
  })

  it("should fail proof verification with length mismatch", async function () {
    let proof = {
      q: [
        { i: -1, v: 1 },
        { i: -2, v: 2 },
        { i: -3, v: 3 },
      ],
      mus: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0], // Wrong
      sigma: { x: 1, y: 2 },
      u: [
        { x: 1, y: 2 },
        { x: 1, y: 2 },
        { x: 1, y: 2 },
      ],
      name: ethers.utils.toUtf8Bytes("test"),
      publicKey: {
        x: [1, 2],
        y: [1, 2],
      },
    }
    expect(bn254.callStatic.verifyProof(proof)).to.be.revertedWith(
      "setup, query, and proof length mismatch"
    )
  })

  it("should successfully verify a proof", async function () {
    let proof = {
      q: [
        {
          i: 0,
          v: "0x0c31b73f16d1c31de28dd4651a9b5f62a9212938b4b041f3f4db25a65539ce9c",
        },
      ],
      mus: [
        "0x25920f9d4590bcb099933cae3afeda6ad9a0e4bb8602f167c31d1ab332f6718b",
      ],
      sigma: {
        x: "0x24e9c16ab07296e7a16c06d91c10fd52eda14798ca5bf6a7e16a98d528bd199e",
        y: "0x204ab8989fc6a373baa71bed526ed0f63705dd2617ae6b9f9df9e115f5e8fae4",
      },
      u: [
        {
          x: "0x102bd2e684495754b9ef8edd0aa70cf628fb8666c692a11ee89ad9fbfeb11a02",
          y: "0x245369d1ea21fbaaea3264b9867ea74c121e72f66a94b3b785b9ce742be6c8f6",
        },
      ],
      name: ethers.utils.toUtf8Bytes(
        "91de7326fea6823a95d65880e7d9c695de96d84e0c1292f1fe6beae6b33d26927699" +
          "22796b3c2f213e2f667202babb53a97ff54443520998192b82da11a1de7c2e90875f" +
          "84b4fed5f31622093fe57d89669f660e8fc731bf22293529a141ece41d4060e7a664" +
          "5bd8fe0c1172ae377fdc5ae73889d34f81d2dbf105c3f756b4e0a253451a5a7a3cfb" +
          "fb253b21c49c59701513b9ad9f8a9b192c3cc7232024254be4173785a7c08f32a60c" +
          "3425d74c263584078604d2527ffdec60c15b050877eedd8c73700991f4efd04d7639" +
          "14b73d8179e25aa6bd4ee6ae0fcd0b11f8c502baf828e0cbbd3a6dfd712894f10e8c" +
          "96a90f454ef4b2a22ef19ea550555e324d69e977a9e5a8bd57b34563fb199530919a" +
          "d80acd8d2f2c1eb4c9b48d2e57e6305131f1878b68c45d6b1fa35ab0e6bf44001f81" +
          "1f613538f11f2efaba53e339d521074d8c14756c39c9b0b5cc68b14779cb223cd2e1" +
          "c08bacc55f6499b72ea5ceca033efb6826c699d225ed772428a2153da091f6f6536c" +
          "8df25e51e861526e2f9bb130f33c6d03c94f65bd3a3f4a6f0e7ab80ee5303b275667" +
          "a922ae87102e6862a80fa8840ef291ec6a66a1ee94818e6b715fba1546a2aeffae38" +
          "078986ecdc6df4305836e17dd4633b3b9bbd0f22d8e1a0292f4940509d98fa7ee0d5" +
          "2078c85080458fdab6b4bf9a42400248e8b4e9530fa9f1cd421e98f40ee8585434e4" +
          "98d2"
      ),
      publicKey: {
        x: [
          "0x07d42b42c4eddef5a05309382acd6facd59cee75d1d811cbbcd52b1b55b8e31b",
          "0x21e4617026fdf43d59893c2ad8fb00acb4167ae895e80c58a5d013928a601184",
        ],
        y: [
          "0x0e86e2f05fb3e72609b0cfea77633eca05f4bf34851874d84e5a2c2f2985fa7d",
          "0x1d20bf4bc725cc14d0d0a8bc98b3391582c48ad99a41669a5349a5cab5864e10",
        ],
      },
    }
    expect(await bn254.callStatic.verifyProof(proof)).to.be.equal(false)
  })
})
