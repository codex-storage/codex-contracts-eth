const { ethers } = require("hardhat")
const { hexlify, randomBytes } = ethers.utils
const { expect } = require("chai")
const { exampleRequest } = require("./examples")
const { hours, minutes } = require("./time")
const { requestId, slotId, askToArray } = require("./ids")
const {
  waitUntilCancelled,
  waitUntilStarted,
  waitUntilFinished,
  waitUntilFailed,
  RequestState
} = require("./marketplace")
const { price, pricePerSlot } = require("./price")
const {
  snapshot,
  revert,
  ensureMinimumBlockHeight,
  advanceTime,
  currentTime,
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
      await token.mint(account.address, 1_000_000_000)
    }

    const Marketplace = await ethers.getContractFactory("TestMarketplace")
    marketplace = await Marketplace.deploy(
      token.address,
      collateral,
      proofPeriod,
      proofTimeout,
      proofDowntime
    )

    request = await exampleRequest()
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
      await token.approve(marketplace.address, price(request))
      await expect(marketplace.requestStorage(request))
        .to.emit(marketplace, "StorageRequested")
        .withArgs(requestId(request), askToArray(request.ask))
    })

    it("rejects request with invalid client address", async function () {
      let invalid = { ...request, client: host.address }
      await token.approve(marketplace.address, price(invalid))
      await expect(marketplace.requestStorage(invalid)).to.be.revertedWith(
        "Invalid client address"
      )
    })

    it("rejects request with insufficient payment", async function () {
      let insufficient = price(request) - 1
      await token.approve(marketplace.address, insufficient)
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "ERC20: insufficient allowance"
      )
    })

    it("rejects resubmission of request", async function () {
      await token.approve(marketplace.address, price(request) * 2)
      await marketplace.requestStorage(request)
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "Request already exists"
      )
    })
  })

  describe("filling a slot", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
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
      let unknown = await exampleRequest()
      await expect(
        marketplace.fillSlot(requestId(unknown), 0, proof)
      ).to.be.revertedWith("Unknown request")
    })

    it("is rejected when request is cancelled", async function () {
      switchAccount(client)
      let expired = { ...request, expiry: (await currentTime()) - hours(1) }
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(expired)
      switchAccount(host)
      await expect(
        marketplace.fillSlot(requestId(expired), slot.index, proof)
      ).to.be.revertedWith("Request not accepting proofs")
    })

    it("is rejected when request is finished", async function () {
      const lastSlot = await waitUntilStarted(marketplace, request, slot, proof)
      await waitUntilFinished(marketplace, lastSlot)
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof)
      ).to.be.revertedWith("Request not accepting proofs")
    })

    it("is rejected when request is failed", async function () {
      await waitUntilStarted(marketplace, request, slot, proof)
      await waitUntilFailed(marketplace, request, slot)
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof)
      ).to.be.revertedWith("Request not accepting proofs")
    })

    it("is rejected when slot index not in range", async function () {
      const invalid = request.ask.slots
      await expect(
        marketplace.fillSlot(slot.request, invalid, proof)
      ).to.be.revertedWith("Invalid slot")
    })

    it("fails when all slots are already filled", async function () {
      const lastSlot = request.ask.slots - 1
      for (let i = 0; i <= lastSlot; i++) {
        await marketplace.fillSlot(slot.request, i, proof)
      }
      await expect(
        marketplace.fillSlot(slot.request, lastSlot, proof)
      ).to.be.revertedWith("Slot already filled")
    })
  })

  describe("proof end", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, collateral)
      await marketplace.deposit(collateral)
    })

    it("shares proof end time for all slots in request", async function () {
      const lastSlot = request.ask.slots - 1
      for (let i = 0; i < lastSlot; i++) {
        await marketplace.fillSlot(slot.request, i, proof)
      }
      advanceTime(minutes(10))
      await marketplace.fillSlot(slot.request, lastSlot, proof)
      let slot0 = { ...slot, index: 0 }
      let end = await marketplace.proofEnd(slotId(slot0))
      for (let i = 1; i <= lastSlot; i++) {
        let sloti = { ...slot, index: i }
        await expect((await marketplace.proofEnd(slotId(sloti))) === end)
      }
    })

    it("sets proof end time to the request duration once filled", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await expect(await marketplace.proofEnd(slotId(slot))).to.be.eq(
        (await currentTime()) + request.ask.duration
      )
    })

    it("sets proof end time to the past once failed", async function () {
      await waitUntilStarted(marketplace, request, slot, proof)
      await waitUntilFailed(marketplace, request, slot)
      let slot0 = { ...slot, index: request.ask.maxSlotLoss + 1 }
      const now = await currentTime()
      await expect(await marketplace.proofEnd(slotId(slot0))).to.be.eq(now - 1)
    })

    it("sets proof end time to the past once cancelled", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(request)
      const now = await currentTime()
      await expect(await marketplace.proofEnd(slotId(slot))).to.be.eq(now - 1)
    })

    it("sets proof end time to the past once finished", async function () {
      const lastSlot = await waitUntilStarted(marketplace, request, slot, proof)
      await waitUntilFinished(marketplace, lastSlot) // sets proofEnd to block.timestamp - 1
      const now = await currentTime()
      // the proof end time is set to block.timestamp - 1 when the contract is
      // finished. in the process of calling currentTime and proofEnd,
      // block.timestamp has advanced by 1, so the expected proof end time will
      // be block.timestamp - 2.
      await expect(await marketplace.proofEnd(slotId(slot))).to.be.eq(now - 2)
    })
  })

  describe("freeing a slot", function () {
    var id
    beforeEach(async function () {
      slot.index = 0
      id = slotId(slot)

      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, collateral)
      await marketplace.deposit(collateral)
    })

    it("fails to free slot when slot not filled", async function () {
      slot.index = 5
      let nonExistentId = slotId(slot)
      await expect(marketplace.freeSlot(nonExistentId)).to.be.revertedWith(
        "Slot empty"
      )
    })

    it("fails to free slot when cancelled", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(request)
      await expect(marketplace.freeSlot(slotId(slot))).to.be.revertedWith(
        "Slot not accepting proofs"
      )
    })

    it("fails to free slot when finished", async function () {
      const lastSlot = await waitUntilStarted(marketplace, request, slot, proof)
      await waitUntilFinished(marketplace, lastSlot)
      await expect(marketplace.freeSlot(slotId(slot))).to.be.revertedWith(
        "Slot not accepting proofs"
      )
    })

    it("successfully frees slot", async function () {
      await waitUntilStarted(marketplace, request, slot, proof)
      await expect(marketplace.freeSlot(id)).not.to.be.reverted
    })

    it("emits event once slot is freed", async function () {
      await waitUntilStarted(marketplace, request, slot, proof)
      await expect(await marketplace.freeSlot(id))
        .to.emit(marketplace, "SlotFreed")
        .withArgs(slot.request, id)
    })

    it("cannot get slot once freed", async function () {
      await waitUntilStarted(marketplace, request, slot, proof)
      await marketplace.freeSlot(id)
      await expect(marketplace.slot(id)).to.be.revertedWith("Slot empty")
    })
  })

  describe("paying out a slot", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, collateral)
      await marketplace.deposit(collateral)
    })

    it("pays the host", async function () {
      const lastSlot = await waitUntilStarted(marketplace, request, slot, proof)
      await waitUntilFinished(marketplace, lastSlot)
      const startBalance = await token.balanceOf(host.address)
      await marketplace.payoutSlot(slot.request, slot.index)
      const endBalance = await token.balanceOf(host.address)
      expect(endBalance - startBalance).to.equal(pricePerSlot(request))
    })

    it("is only allowed when the contract has ended", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await expect(
        marketplace.payoutSlot(slot.request, slot.index)
      ).to.be.revertedWith("Contract not ended")
    })

    it("can only be done once", async function () {
      const lastSlot = await waitUntilStarted(marketplace, request, slot, proof)
      await waitUntilFinished(marketplace, lastSlot)
      await marketplace.payoutSlot(slot.request, slot.index)
      await expect(
        marketplace.payoutSlot(slot.request, slot.index)
      ).to.be.revertedWith("Already paid")
    })

    it("cannot be filled again", async function () {
      const lastSlot = await waitUntilStarted(marketplace, request, slot, proof)
      await waitUntilFinished(marketplace, lastSlot)
      await marketplace.payoutSlot(slot.request, slot.index)
      await expect(marketplace.fillSlot(slot.request, slot.index, proof)).to.be
        .reverted
    })
  })

  describe("fulfilling a request", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
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
    it("sets state when all slots are filled", async function () {
      const lastSlot = request.ask.slots - 1
      for (let i = 0; i <= lastSlot; i++) {
        await marketplace.fillSlot(slot.request, i, proof)
      }
      await expect(await marketplace.state(slot.request)).to.equal(
        RequestState.Started
      )
    })
    it("fails when all slots are already filled", async function () {
      const lastSlot = request.ask.slots - 1
      for (let i = 0; i <= lastSlot; i++) {
        await marketplace.fillSlot(slot.request, i, proof)
      }
      await expect(
        marketplace.fillSlot(slot.request, lastSlot, proof)
      ).to.be.revertedWith("Slot already filled")
    })
  })

  describe("withdrawing funds", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, collateral)
      await marketplace.deposit(collateral)
    })

    it("rejects withdraw when request not yet timed out", async function () {
      switchAccount(client)
      await expect(marketplace.withdrawFunds(slot.request)).to.be.revertedWith(
        "Request not yet timed out"
      )
    })

    it("rejects withdraw when wrong account used", async function () {
      await waitUntilCancelled(request)
      await expect(marketplace.withdrawFunds(slot.request)).to.be.revertedWith(
        "Invalid client address"
      )
    })

    it("rejects withdraw when in wrong state", async function () {
      // fill all slots, should change state to RequestState.Started
      const lastSlot = request.ask.slots - 1
      for (let i = 0; i <= lastSlot; i++) {
        await marketplace.fillSlot(slot.request, i, proof)
      }
      await waitUntilCancelled(request)
      switchAccount(client)
      await expect(marketplace.withdrawFunds(slot.request)).to.be.revertedWith(
        "Invalid state"
      )
    })

    it("emits event once request is cancelled", async function () {
      await waitUntilCancelled(request)
      switchAccount(client)
      await expect(marketplace.withdrawFunds(slot.request))
        .to.emit(marketplace, "RequestCancelled")
        .withArgs(requestId(request))
    })

    it("withdraws to the client", async function () {
      await waitUntilCancelled(request)
      switchAccount(client)
      const startBalance = await token.balanceOf(client.address)
      await marketplace.withdrawFunds(slot.request)
      const endBalance = await token.balanceOf(client.address)
      expect(endBalance - startBalance).to.equal(price(request))
    })
  })

  describe("contract state", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, collateral)
      await marketplace.deposit(collateral)
    })

    it("changes state to Cancelled when client withdraws funds", async function () {
      await expect(await marketplace.state(slot.request)).to.equal(
        RequestState.New
      )
    })

    it("state is Cancelled when client withdraws funds", async function () {
      await waitUntilCancelled(request)
      switchAccount(client)
      await marketplace.withdrawFunds(slot.request)
      await expect(await marketplace.state(slot.request)).to.equal(
        RequestState.Cancelled
      )
    })

    it("changes state to Started once all slots are filled", async function () {
      await waitUntilStarted(marketplace, request, slot, proof)
      await expect(await marketplace.state(slot.request)).to.equal(
        RequestState.Started
      )
    })

    it("state is Failed once too many slots are freed", async function () {
      await waitUntilStarted(marketplace, request, slot, proof)
      await waitUntilFailed(marketplace, request, slot)
      await expect(await marketplace.state(slot.request)).to.equal(
        RequestState.Failed
      )
    })

    it("state is Finished once slot is paid out", async function () {
      const lastSlot = await waitUntilStarted(marketplace, request, slot, proof)
      await waitUntilFinished(marketplace, lastSlot)
      await marketplace.payoutSlot(slot.request, slot.index)
      await expect(await marketplace.state(slot.request)).to.equal(
        RequestState.Finished
      )
    })
    it("does not change state to Failed if too many slots freed but contract not started", async function () {
      for (let i = 0; i <= request.ask.maxSlotLoss; i++) {
        await marketplace.fillSlot(slot.request, i, proof)
      }
      for (let i = 0; i <= request.ask.maxSlotLoss; i++) {
        slot.index = i
        let id = slotId(slot)
        await marketplace.freeSlot(id)
      }
      await expect(await marketplace.state(slot.request)).to.equal(
        RequestState.New
      )
    })

    it("changes state to Cancelled once request is cancelled", async function () {
      await waitUntilCancelled(request)
      await expect(await marketplace.state(slot.request)).to.equal(
        RequestState.Cancelled
      )
    })

    it("changes isCancelled to true once request is cancelled", async function () {
      await expect(await marketplace.isCancelled(slot.request)).to.be.false
      await waitUntilCancelled(request)
      await expect(await marketplace.isCancelled(slot.request)).to.be.true
    })

    it("rejects isSlotCancelled when slot is empty", async function () {
      await expect(
        marketplace.isSlotCancelled(slotId(slot))
      ).to.be.revertedWith("Slot empty")
    })

    it("changes isSlotCancelled to true once request is cancelled", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await expect(await marketplace.isSlotCancelled(slotId(slot))).to.be.false
      await waitUntilCancelled(request)
      await expect(await marketplace.isSlotCancelled(slotId(slot))).to.be.true
    })

    it("changes proofEnd to the past when request is cancelled", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await expect(await marketplace.proofEnd(slotId(slot))).to.be.gt(
        await currentTime()
      )
      await waitUntilCancelled(request)
      await expect(await marketplace.proofEnd(slotId(slot))).to.be.lt(
        await currentTime()
      )
    })
  })
  describe("modifiers", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, collateral)
      await marketplace.deposit(collateral)
    })

    describe("accepting proofs", function () {
      it("fails when request Cancelled (isCancelled is true)", async function () {
        await marketplace.fillSlot(slot.request, slot.index, proof)
        await waitUntilCancelled(request)
        await expect(
          marketplace.testAcceptsProofs(slotId(slot))
        ).to.be.revertedWith("Slot not accepting proofs")
      })

      it("fails when request Cancelled (state set to Cancelled)", async function () {
        await marketplace.fillSlot(slot.request, slot.index, proof)
        await waitUntilCancelled(request)
        switchAccount(client)
        await marketplace.withdrawFunds(slot.request)
        await expect(
          marketplace.testAcceptsProofs(slotId(slot))
        ).to.be.revertedWith("Slot not accepting proofs")
      })

      it("fails when request Finished (isFinished is true)", async function () {
        const lastSlot = await waitUntilStarted(
          marketplace,
          request,
          slot,
          proof
        )
        await waitUntilFinished(marketplace, lastSlot)
        await expect(
          marketplace.testAcceptsProofs(slotId(slot))
        ).to.be.revertedWith("Slot not accepting proofs")
      })

      it("fails when request Finished (state set to Finished)", async function () {
        const lastSlot = await waitUntilStarted(
          marketplace,
          request,
          slot,
          proof
        )
        await waitUntilFinished(marketplace, lastSlot)
        await marketplace.payoutSlot(slot.request, slot.index)
        await expect(
          marketplace.testAcceptsProofs(slotId(slot))
        ).to.be.revertedWith("Slot not accepting proofs")
      })

      it("fails when request Failed", async function () {
        await waitUntilStarted(marketplace, request, slot, proof)
        for (let i = 0; i <= request.ask.maxSlotLoss; i++) {
          slot.index = i
          let id = slotId(slot)
          await marketplace.freeSlot(id)
        }
        await expect(
          marketplace.testAcceptsProofs(slotId(slot))
        ).to.be.revertedWith("Slot empty")
      })
    })
  })
})
