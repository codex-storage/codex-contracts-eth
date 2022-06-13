const { ethers } = require("hardhat")
const { hexlify, randomBytes } = ethers.utils
const { expect } = require("chai")
const { exampleRequest, exampleOffer } = require("./examples")
const { snapshot, revert, ensureMinimumBlockHeight } = require("./evm")
const { now, hours } = require("./time")
const { requestId, offerId, offerToArray, askToArray } = require("./ids")

describe("Marketplace", function () {
  const collateral = 100
  const proofPeriod = 30 * 60
  const proofTimeout = 5
  const proofDowntime = 64

  let marketplace
  let token
  let client, host, host1, host2, host3
  let request, offer

  beforeEach(async function () {
    await snapshot()
    await ensureMinimumBlockHeight(256)
    ;[client, host1, host2, host3] = await ethers.getSigners()
    host = host1

    const TestToken = await ethers.getContractFactory("TestToken")
    token = await TestToken.deploy()
    for (account of [client, host1, host2, host3]) {
      await token.mint(account.address, 1000)
    }

    const Marketplace = await ethers.getContractFactory("Marketplace")
    marketplace = await Marketplace.deploy(
      token.address,
      collateral,
      proofPeriod,
      proofTimeout,
      proofDowntime
    )

    request = exampleRequest()
    request.client = client.address

    offer = exampleOffer()
    offer.host = host.address
    offer.requestId = requestId(request)
  })

  afterEach(async function () {
    await revert()
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
      await token.approve(marketplace.address, request.ask.maxPrice)
      await expect(marketplace.requestStorage(request))
        .to.emit(marketplace, "StorageRequested")
        .withArgs(requestId(request), askToArray(request.ask))
    })

    it("rejects request with invalid client address", async function () {
      let invalid = { ...request, client: host.address }
      await token.approve(marketplace.address, invalid.ask.maxPrice)
      await expect(marketplace.requestStorage(invalid)).to.be.revertedWith(
        "Invalid client address"
      )
    })

    it("rejects request with insufficient payment", async function () {
      let insufficient = request.ask.maxPrice - 1
      await token.approve(marketplace.address, insufficient)
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "ERC20: insufficient allowance"
      )
    })

    it("rejects resubmission of request", async function () {
      await token.approve(marketplace.address, request.ask.maxPrice * 2)
      await marketplace.requestStorage(request)
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "Request already exists"
      )
    })
  })

  describe("fulfilling request", function () {
    const proof = hexlify(randomBytes(42))

    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, request.ask.maxPrice)
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, collateral)
      await marketplace.deposit(collateral)
    })

    it("emits event when request is fulfilled", async function () {
      await expect(marketplace.fulfillRequest(requestId(request), proof))
        .to.emit(marketplace, "RequestFulfilled")
        .withArgs(requestId(request))
    })

    it("locks collateral of host", async function () {
      await marketplace.fulfillRequest(requestId(request), proof)
      await expect(marketplace.withdraw()).to.be.revertedWith("Account locked")
    })

    it("starts requiring storage proofs", async function () {
      await marketplace.fulfillRequest(requestId(request), proof)
      expect(await marketplace.proofEnd(requestId(request))).to.be.gt(0)
    })

    it("is rejected when proof is incorrect", async function () {
      let invalid = hexlify([])
      await expect(
        marketplace.fulfillRequest(requestId(request), invalid)
      ).to.be.revertedWith("Invalid proof")
    })

    it("is rejected when collateral is insufficient", async function () {
      let insufficient = collateral - 1
      await marketplace.withdraw()
      await token.approve(marketplace.address, insufficient)
      await marketplace.deposit(insufficient)
      await expect(
        marketplace.fulfillRequest(requestId(request), proof)
      ).to.be.revertedWith("Insufficient collateral")
    })

    it("is rejected when request already fulfilled", async function () {
      await marketplace.fulfillRequest(requestId(request), proof)
      await expect(
        marketplace.fulfillRequest(requestId(request), proof)
      ).to.be.revertedWith("Request already fulfilled")
    })

    it("is rejected when request is unknown", async function () {
      let unknown = exampleRequest()
      await expect(
        marketplace.fulfillRequest(requestId(unknown), proof)
      ).to.be.revertedWith("Unknown request")
    })

    it("is rejected when request is expired", async function () {
      switchAccount(client)
      let expired = { ...request, expiry: now() - hours(1) }
      await token.approve(marketplace.address, request.ask.maxPrice)
      await marketplace.requestStorage(expired)
      switchAccount(host)
      await expect(
        marketplace.fulfillRequest(requestId(expired), proof)
      ).to.be.revertedWith("Request expired")
    })
  })

  describe("offering storage", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, request.ask.maxPrice)
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, collateral)
      await marketplace.deposit(collateral)
    })

    it("emits event when storage is offered", async function () {
      await expect(marketplace.offerStorage(offer))
        .to.emit(marketplace, "StorageOffered")
        .withArgs(offerId(offer), offerToArray(offer), requestId(request))
    })

    it("locks collateral of host", async function () {
      await marketplace.offerStorage(offer)
      await expect(marketplace.withdraw()).to.be.revertedWith("Account locked")
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

    it("rejects offer for expired request", async function () {
      switchAccount(client)
      let expired = { ...request, expiry: now() - hours(1) }
      await token.approve(marketplace.address, request.ask.maxPrice)
      await marketplace.requestStorage(expired)
      switchAccount(host)
      let invalid = { ...offer, requestId: requestId(expired) }
      await expect(marketplace.offerStorage(invalid)).to.be.revertedWith(
        "Request expired"
      )
    })

    it("rejects an offer that exceeds the maximum price", async function () {
      let invalid = { ...offer, price: request.ask.maxPrice + 1 }
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

  describe("selecting an offer", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, request.ask.maxPrice)
      await marketplace.requestStorage(request)
      for (host of [host1, host2, host3]) {
        switchAccount(host)
        let hostOffer = { ...offer, host: host.address }
        await token.approve(marketplace.address, collateral)
        await marketplace.deposit(collateral)
        await marketplace.offerStorage(hostOffer)
      }
      switchAccount(client)
    })

    it("emits event when offer is selected", async function () {
      await expect(marketplace.selectOffer(offerId(offer)))
        .to.emit(marketplace, "OfferSelected")
        .withArgs(offerId(offer), requestId(request))
    })

    it("returns price difference to client", async function () {
      let difference = request.ask.maxPrice - offer.price
      let before = await token.balanceOf(client.address)
      await marketplace.selectOffer(offerId(offer))
      let after = await token.balanceOf(client.address)
      expect(after - before).to.equal(difference)
    })

    it("unlocks collateral of hosts that weren't chosen", async function () {
      await marketplace.selectOffer(offerId(offer))
      switchAccount(host2)
      await expect(marketplace.withdraw()).not.to.be.reverted
      switchAccount(host3)
      await expect(marketplace.withdraw()).not.to.be.reverted
    })

    it("locks collateral of host that was chosen", async function () {
      await marketplace.selectOffer(offerId(offer))
      switchAccount(host1)
      await expect(marketplace.withdraw()).to.be.revertedWith("Account locked")
    })

    it("rejects selection of unknown offer", async function () {
      let unknown = exampleOffer()
      await expect(
        marketplace.selectOffer(offerId(unknown))
      ).to.be.revertedWith("Unknown offer")
    })

    it("rejects selection of expired offer", async function () {
      let expired = { ...offer, expiry: now() - hours(1) }
      switchAccount(host1)
      await marketplace.offerStorage(expired)
      switchAccount(client)
      await expect(
        marketplace.selectOffer(offerId(expired))
      ).to.be.revertedWith("Offer expired")
    })

    it("rejects reselection of offer", async function () {
      let secondOffer = { ...offer, host: host2.address }
      await marketplace.selectOffer(offerId(offer))
      await expect(
        marketplace.selectOffer(offerId(secondOffer))
      ).to.be.revertedWith("Offer already selected")
    })

    it("rejects selection by anyone other than the client", async function () {
      switchAccount(host1)
      await expect(marketplace.selectOffer(offerId(offer))).to.be.revertedWith(
        "Only client can select offer"
      )
    })
  })
})
