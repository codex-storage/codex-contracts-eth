const { ethers } = require("hardhat")
const { expect } = require("chai")
const { exampleRequest, exampleOffer } = require("./examples")
const { now, hours } = require("./time")
const { keccak256, defaultAbiCoder } = ethers.utils

describe("Marketplace", function () {
  const collateral = 100

  let marketplace
  let token
  let client, host
  let request, offer

  beforeEach(async function () {
    ;[client, host] = await ethers.getSigners()

    const TestToken = await ethers.getContractFactory("TestToken")
    token = await TestToken.deploy()
    await token.mint(client.address, 1000)
    await token.mint(host.address, 1000)

    const Marketplace = await ethers.getContractFactory("Marketplace")
    marketplace = await Marketplace.deploy(token.address, collateral)

    request = exampleRequest()
    request.client = client.address

    offer = exampleOffer()
    offer.host = host.address
    offer.requestId = requestId(request)
  })

  function switchAccount(account) {
    token = token.connect(account)
    marketplace = marketplace.connect(account)
  }

  describe("requesting storage", function () {
    beforeEach(function () {
      switchAccount(client)
    })

    it("emits event when storage is requested", async function () {
      await token.approve(marketplace.address, request.maxPrice)
      await expect(marketplace.requestStorage(request))
        .to.emit(marketplace, "StorageRequested")
        .withArgs(requestId(request), requestToArray(request))
    })

    it("rejects request with invalid client address", async function () {
      let invalid = { ...request, client: host.address }
      await token.approve(marketplace.address, invalid.maxPrice)
      await expect(marketplace.requestStorage(invalid)).to.be.revertedWith(
        "Invalid client address"
      )
    })

    it("rejects request with insufficient payment", async function () {
      let insufficient = request.maxPrice - 1
      await token.approve(marketplace.address, insufficient)
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "ERC20: transfer amount exceeds allowance"
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

  describe("offering storage", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, request.maxPrice)
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, collateral)
      await marketplace.deposit(collateral)
    })

    it("emits event when storage is offered", async function () {
      await expect(marketplace.offerStorage(offer))
        .to.emit(marketplace, "StorageOffered")
        .withArgs(offerId(offer), offerToArray(offer))
    })

    it("rejects offer with invalid host address", async function () {
      let invalid = { ...offer, host: client.address }
      await expect(marketplace.offerStorage(invalid)).to.be.revertedWith(
        "Invalid host address"
      )
    })

    it("rejects offer for unknown request", async function () {
      let unknown = exampleRequest()
      let invalid = { ...offer, requestId: requestId(unknown) }
      await expect(marketplace.offerStorage(invalid)).to.be.revertedWith(
        "Unknown request"
      )
    })

    it("rejects an offer that exceeds the maximum price", async function () {
      let invalid = { ...offer, price: request.maxPrice + 1 }
      await expect(marketplace.offerStorage(invalid)).to.be.revertedWith(
        "Price too high"
      )
    })

    it("rejects resubmission of offer", async function () {
      await marketplace.offerStorage(offer)
      await expect(marketplace.offerStorage(offer)).to.be.revertedWith(
        "Offer already exists"
      )
    })

    it("rejects offer with insufficient collateral", async function () {
      let insufficient = collateral - 1
      await marketplace.withdraw()
      await token.approve(marketplace.address, insufficient)
      await marketplace.deposit(insufficient)
      await expect(marketplace.offerStorage(offer)).to.be.revertedWith(
        "Insufficient collateral"
      )
    })
  })
})

function requestId(request) {
  return keccak256(
    defaultAbiCoder.encode(
      [
        "address",
        "uint256",
        "uint256",
        "bytes32",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "bytes32",
      ],
      requestToArray(request)
    )
  )
}

function offerId(offer) {
  return keccak256(
    defaultAbiCoder.encode(
      ["address", "bytes32", "uint256", "uint256"],
      offerToArray(offer)
    )
  )
}

function requestToArray(request) {
  return [
    request.client,
    request.duration,
    request.size,
    request.contentHash,
    request.proofPeriod,
    request.proofTimeout,
    request.maxPrice,
    request.expiry,
    request.nonce,
  ]
}

function offerToArray(offer) {
  return [offer.host, offer.requestId, offer.price, offer.expiry]
}
