const { ethers } = require("hardhat")
const { expect } = require("chai")
const { exampleRequest, exampleOffer } = require("./examples")
const { now, hours } = require("./time")
const { requestId, offerId, requestToArray, offerToArray } = require("./ids")

describe("Marketplace", function () {
  const collateral = 100

  let marketplace
  let token
  let client, host, host1, host2, host3
  let request, offer

  beforeEach(async function () {
    ;[client, host1, host2, host3] = await ethers.getSigners()
    host = host1

    const TestToken = await ethers.getContractFactory("TestToken")
    token = await TestToken.deploy()
    for (account of [client, host1, host2, host3]) {
      await token.mint(account.address, 1000)
    }

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
        "ERC20: insufficient allowance"
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
      await token.approve(marketplace.address, request.maxPrice)
      await marketplace.requestStorage(expired)
      switchAccount(host)
      let invalid = { ...offer, requestId: requestId(expired) }
      await expect(marketplace.offerStorage(invalid)).to.be.revertedWith(
        "Request expired"
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

  describe("selecting an offer", async function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, request.maxPrice)
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
      let difference = request.maxPrice - offer.price
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
