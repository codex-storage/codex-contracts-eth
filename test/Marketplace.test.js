const { ethers } = require("hardhat")
const { hexlify, randomBytes } = ethers.utils
const { expect } = require("chai")
const { exampleRequest } = require("./examples")
const { now, hours } = require("./time")
const { requestId, slotId, askToArray } = require("./ids")
const {
  snapshot,
  revert,
  ensureMinimumBlockHeight,
  advanceTimeTo,
} = require("./evm")

describe("Marketplace", function () {
  const collateral = 100
  const proofPeriod = 30 * 60
  const proofTimeout = 5
  const proofDowntime = 64
  const proof = hexlify(randomBytes(42))

  let marketplace
  let token
  let client, host, host1, host2, host3
  let request
  let slot

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

    slot = {
      request: requestId(request),
      index: request.ask.slots / 2,
    }
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
      await token.approve(marketplace.address, request.ask.reward)
      await expect(marketplace.requestStorage(request))
        .to.emit(marketplace, "StorageRequested")
        .withArgs(requestId(request), askToArray(request.ask))
    })

    it("rejects request with invalid client address", async function () {
      let invalid = { ...request, client: host.address }
      await token.approve(marketplace.address, invalid.ask.reward)
      await expect(marketplace.requestStorage(invalid)).to.be.revertedWith(
        "Invalid client address"
      )
    })

    it("rejects request with insufficient payment", async function () {
      let insufficient = request.ask.reward - 1
      await token.approve(marketplace.address, insufficient)
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "ERC20: insufficient allowance"
      )
    })

    it("rejects resubmission of request", async function () {
      await token.approve(marketplace.address, request.ask.reward * 2)
      await marketplace.requestStorage(request)
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "Request already exists"
      )
    })
  })

  describe("filling a slot", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, request.ask.reward)
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, collateral)
      await marketplace.deposit(collateral)
    })

    it("emits event when slot is filled", async function () {
      await expect(marketplace.fillSlot(slot.request, slot.index, proof))
        .to.emit(marketplace, "SlotFilled")
        .withArgs(slot.request, slot.index, slotId(slot))
    })

    it("locks collateral of host", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await expect(marketplace.withdraw()).to.be.revertedWith("Account locked")
    })

    it("starts requiring storage proofs", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      expect(await marketplace.proofEnd(slotId(slot))).to.be.gt(0)
    })

    it("is rejected when proof is incorrect", async function () {
      let invalid = hexlify([])
      await expect(
        marketplace.fillSlot(slot.request, slot.index, invalid)
      ).to.be.revertedWith("Invalid proof")
    })

    it("is rejected when collateral is insufficient", async function () {
      let insufficient = collateral - 1
      await marketplace.withdraw()
      await token.approve(marketplace.address, insufficient)
      await marketplace.deposit(insufficient)
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof)
      ).to.be.revertedWith("Insufficient collateral")
    })

    it("is rejected when slot already filled", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof)
      ).to.be.revertedWith("Slot already filled")
    })

    it("is rejected when request is unknown", async function () {
      let unknown = exampleRequest()
      await expect(
        marketplace.fillSlot(requestId(unknown), 0, proof)
      ).to.be.revertedWith("Unknown request")
    })

    it("is rejected when request is expired", async function () {
      switchAccount(client)
      let expired = { ...request, expiry: now() - hours(1) }
      await token.approve(marketplace.address, request.ask.reward)
      await marketplace.requestStorage(expired)
      switchAccount(host)
      await expect(
        marketplace.fillSlot(requestId(expired), slot.index, proof)
      ).to.be.revertedWith("Request expired")
    })

    it("is rejected when slot index not in range", async function () {
      const invalid = request.ask.slots
      await expect(
        marketplace.fillSlot(slot.request, invalid, proof)
      ).to.be.revertedWith("Invalid slot")
    })
  })

  describe("paying out a slot", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, request.ask.reward)
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, collateral)
      await marketplace.deposit(collateral)
    })

    async function waitUntilEnd() {
      const end = (await marketplace.proofEnd(slotId(slot))).toNumber()
      await advanceTimeTo(end)
    }

    it("pays the host", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilEnd()
      const startBalance = await token.balanceOf(host.address)
      await marketplace.payoutSlot(slot.request, slot.index)
      const endBalance = await token.balanceOf(host.address)
      expect(endBalance - startBalance).to.equal(request.ask.reward)
    })

    it("is only allowed when the slot is filled", async function () {
      await expect(
        marketplace.payoutSlot(slot.request, slot.index)
      ).to.be.revertedWith("Slot empty")
    })

    it("is only allowed when the contract has ended", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await expect(
        marketplace.payoutSlot(slot.request, slot.index)
      ).to.be.revertedWith("Contract not ended")
    })

    it("can only be done once", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilEnd()
      await marketplace.payoutSlot(slot.request, slot.index)
      await expect(
        marketplace.payoutSlot(slot.request, slot.index)
      ).to.be.revertedWith("Already paid")
    })

    it("cannot be filled again", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilEnd()
      await marketplace.payoutSlot(slot.request, slot.index)
      await expect(marketplace.fillSlot(slot.request, slot.index, proof)).to.be
        .reverted
    })
  })

  describe("fulfilling a request", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, request.ask.reward)
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, collateral)
      await marketplace.deposit(collateral)
    })

    it("emits event when all slots are filled", async function () {
      const lastSlot = request.ask.slots - 1
      for (let i = 0; i < lastSlot; i++) {
        await marketplace.fillSlot(slot.request, i, proof)
      }
      await expect(marketplace.fillSlot(slot.request, lastSlot, proof))
        .to.emit(marketplace, "RequestFulfilled")
        .withArgs(requestId(request))
    })
  })
})
