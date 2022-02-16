const { ethers } = require("hardhat")
const { expect } = require("chai")
const { exampleRequest } = require("./examples")
const { keccak256, defaultAbiCoder } = ethers.utils

describe("Marketplace", function () {
  const request = exampleRequest()

  let marketplace
  let token
  let accounts

  beforeEach(async function () {
    const TestToken = await ethers.getContractFactory("TestToken")
    token = await TestToken.deploy()
    const Marketplace = await ethers.getContractFactory("Marketplace")
    marketplace = await Marketplace.deploy(token.address)
    accounts = await ethers.getSigners()
    await token.mint(accounts[0].address, 1000)
  })

  describe("requesting storage", function () {
    it("emits event when storage is requested", async function () {
      await token.approve(marketplace.address, request.maxPrice)
      await expect(marketplace.requestStorage(request))
        .to.emit(marketplace, "StorageRequested")
        .withArgs(requestId(request), requestToArray(request))
    })

    it("rejects request with insufficient payment", async function () {
      let insufficient = request.maxPrice - 1
      await token.approve(marketplace.address, insufficient)
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "ERC20: transfer amount exceeds allowance"
      )
    })

    it("rejects requests of size 0", async function () {
      let invalid = { ...request, size: 0 }
      await token.approve(marketplace.address, invalid.maxPrice)
      await expect(marketplace.requestStorage(invalid)).to.be.revertedWith(
        "Invalid size"
      )
    })

    it("rejects resubmission of request", async function () {
      await token.approve(marketplace.address, request.maxPrice * 2)
      await marketplace.requestStorage(request)
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "Request already exists"
      )
    })
  })
})

function requestId(request) {
  return keccak256(
    defaultAbiCoder.encode(
      [
        "uint256",
        "uint256",
        "bytes32",
        "uint256",
        "uint256",
        "uint256",
        "bytes32",
      ],
      requestToArray(request)
    )
  )
}

function requestToArray(request) {
  return [
    request.duration,
    request.size,
    request.contentHash,
    request.proofPeriod,
    request.proofTimeout,
    request.maxPrice,
    request.nonce,
  ]
}
