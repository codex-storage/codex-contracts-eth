const { ethers } = require("hardhat")
const { hexlify, randomBytes } = ethers.utils
const { AddressZero } = ethers.constants
const { BigNumber } = ethers
const { expect } = require("chai")
const { exampleRequest } = require("./examples")
const { periodic, hours, minutes } = require("./time")
const { requestId, slotId, askToArray } = require("./ids")
const {
  waitUntilCancelled,
  waitUntilStarted,
  waitUntilFinished,
  waitUntilFailed,
  waitUntilSlotFailed,
  RequestState,
} = require("./marketplace")
const { price, pricePerSlot } = require("./price")
const {
  snapshot,
  revert,
  mine,
  ensureMinimumBlockHeight,
  advanceTime,
  advanceTimeTo,
  currentTime,
} = require("./evm")

describe("Marketplace", function () {
  const collateral = 100
  const minCollateralThreshold = 40
  const slashMisses = 3
  const slashPercentage = 10
  const proofPeriod = 10
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
      minCollateralThreshold,
      slashMisses,
      slashPercentage,
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

    it("allows retrieval of request details", async function () {
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      const id = requestId(request)
      const retrieved = await marketplace.getRequest(id)
      expect(retrieved.client).to.equal(request.client)
      expect(retrieved.expiry).to.equal(request.expiry)
      expect(retrieved.nonce).to.equal(request.nonce)
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

    it("allows retrieval of host that filled slot", async function () {
      expect(await marketplace.getHost(slotId(slot))).to.equal(AddressZero)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      expect(await marketplace.getHost(slotId(slot))).to.equal(host.address)
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
      await waitUntilStarted(marketplace, request, proof)
      await waitUntilFinished(marketplace, requestId(request))
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof)
      ).to.be.revertedWith("Request not accepting proofs")
    })

    it("is rejected when request is failed", async function () {
      await waitUntilStarted(marketplace, request, proof)
      await waitUntilFailed(marketplace, request)
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
    var requestTime
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      requestTime = await currentTime()
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

    it("sets the proof end time to now + duration", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await expect(
        (await marketplace.proofEnd(slotId(slot))).toNumber()
      ).to.be.closeTo(requestTime + request.ask.duration, 1)
    })

    it("sets proof end time to the past once failed", async function () {
      await waitUntilStarted(marketplace, request, proof)
      await waitUntilFailed(marketplace, request)
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

    it("checks that proof end time is in the past once finished", async function () {
      await waitUntilStarted(marketplace, request, proof)
      await waitUntilFinished(marketplace, requestId(request))
      const now = await currentTime()
      // in the process of calling currentTime and proofEnd,
      // block.timestamp has advanced by 1, so the expected proof end time will
      // be block.timestamp - 1.
      await expect(await marketplace.proofEnd(slotId(slot))).to.be.eq(now - 1)
    })
  })

  describe("request end", function () {
    var requestTime
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      requestTime = await currentTime()
      switchAccount(host)
      await token.approve(marketplace.address, collateral)
      await marketplace.deposit(collateral)
    })

    it("shares request end time for all slots in request", async function () {
      const lastSlot = request.ask.slots - 1
      for (let i = 0; i < lastSlot; i++) {
        await marketplace.fillSlot(slot.request, i, proof)
      }
      advanceTime(minutes(10))
      await marketplace.fillSlot(slot.request, lastSlot, proof)
      let slot0 = { ...slot, index: 0 }
      let end = await marketplace.requestEnd(requestId(request))
      for (let i = 1; i <= lastSlot; i++) {
        let sloti = { ...slot, index: i }
        await expect((await marketplace.proofEnd(slotId(sloti))) === end)
      }
    })

    it("sets the request end time to now + duration", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await expect(
        (await marketplace.requestEnd(requestId(request))).toNumber()
      ).to.be.closeTo(requestTime + request.ask.duration, 1)
    })

    it("sets request end time to the past once failed", async function () {
      await waitUntilStarted(marketplace, request, proof)
      await waitUntilFailed(marketplace, request)
      let slot0 = { ...slot, index: request.ask.maxSlotLoss + 1 }
      const now = await currentTime()
      await expect(await marketplace.requestEnd(requestId(request))).to.be.eq(
        now - 1
      )
    })

    it("sets request end time to the past once cancelled", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(request)
      const now = await currentTime()
      await expect(await marketplace.requestEnd(requestId(request))).to.be.eq(
        now - 1
      )
    })

    it("checks that request end time is in the past once finished", async function () {
      await waitUntilStarted(marketplace, request, proof)
      await waitUntilFinished(marketplace, requestId(request))
      const now = await currentTime()
      // in the process of calling currentTime and proofEnd,
      // block.timestamp has advanced by 1, so the expected proof end time will
      // be block.timestamp - 1.
      await expect(await marketplace.requestEnd(requestId(request))).to.be.eq(
        now - 1
      )
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

    it("can only be freed by the host occupying the slot", async function () {
      await waitUntilStarted(marketplace, request, proof)
      switchAccount(client)
      await expect(marketplace.freeSlot(id)).to.be.revertedWith(
        "Slot filled by other host"
      )
    })

    it("successfully frees slot", async function () {
      await waitUntilStarted(marketplace, request, proof)
      await expect(marketplace.freeSlot(id)).not.to.be.reverted
    })

    it("emits event once slot is freed", async function () {
      await waitUntilStarted(marketplace, request, proof)
      await expect(await marketplace.freeSlot(id))
        .to.emit(marketplace, "SlotFreed")
        .withArgs(slot.request, id)
    })

    it("cannot get slot once freed", async function () {
      await waitUntilStarted(marketplace, request, proof)
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

    it("pays the host when contract has finished", async function () {
      await waitUntilStarted(marketplace, request, proof)
      await waitUntilFinished(marketplace, requestId(request))
      const startBalance = await token.balanceOf(host.address)
      await marketplace.freeSlot(slotId(slot))
      const endBalance = await token.balanceOf(host.address)
      expect(endBalance - startBalance).to.equal(pricePerSlot(request))
    })

    it("pays the host when contract was cancelled", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(request)
      const startBalance = await token.balanceOf(host.address)
      await marketplace.freeSlot(slotId(slot))
      const endBalance = await token.balanceOf(host.address)
      expect(endBalance).to.be.gt(startBalance)
    })

    it("does not pay when the contract hasn't ended", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      const startBalance = await token.balanceOf(host.address)
      await marketplace.freeSlot(slotId(slot))
      const endBalance = await token.balanceOf(host.address)
      expect(endBalance).to.equal(startBalance)
    })

    it("can only be done once", async function () {
      await waitUntilStarted(marketplace, request, proof)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      await expect(marketplace.freeSlot(slotId(slot))).to.be.revertedWith(
        "Already paid"
      )
    })

    it("cannot be filled again", async function () {
      await waitUntilStarted(marketplace, request, proof)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
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
      await expect(await marketplace.requestState(slot.request)).to.equal(
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

  describe("collateral locking", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, collateral)
      await marketplace.deposit(collateral)
    })

    it("locks collateral of host when it fills a slot", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await expect(marketplace.withdraw()).to.be.revertedWith("Account locked")
    })

    it("allows withdrawal when all slots are free", async function () {
      let slot1 = { ...slot, index: 0 }
      let slot2 = { ...slot, index: 1 }
      await marketplace.fillSlot(slot1.request, slot1.index, proof)
      await marketplace.fillSlot(slot2.request, slot2.index, proof)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot1))
      await expect(marketplace.withdraw()).to.be.revertedWith("Account locked")
      await marketplace.freeSlot(slotId(slot2))
      await expect(marketplace.withdraw()).not.to.be.reverted
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
      await expect(await marketplace.requestState(slot.request)).to.equal(
        RequestState.New
      )
    })

    it("state is Cancelled when client withdraws funds", async function () {
      await waitUntilCancelled(request)
      switchAccount(client)
      await marketplace.withdrawFunds(slot.request)
      await expect(await marketplace.requestState(slot.request)).to.equal(
        RequestState.Cancelled
      )
    })

    it("changes state to Started once all slots are filled", async function () {
      await waitUntilStarted(marketplace, request, proof)
      await expect(await marketplace.requestState(slot.request)).to.equal(
        RequestState.Started
      )
    })

    it("state is Failed once too many slots are freed", async function () {
      await waitUntilStarted(marketplace, request, proof)
      await waitUntilFailed(marketplace, request)
      await expect(await marketplace.requestState(slot.request)).to.equal(
        RequestState.Failed
      )
    })

    it("state is Finished once slot is paid out", async function () {
      await waitUntilStarted(marketplace, request, proof)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      await expect(await marketplace.requestState(slot.request)).to.equal(
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
        await marketplace.forciblyFreeSlot(id)
      }
      await expect(await marketplace.requestState(slot.request)).to.equal(
        RequestState.New
      )
    })

    it("changes state to Cancelled once request is cancelled", async function () {
      await waitUntilCancelled(request)
      await expect(await marketplace.requestState(slot.request)).to.equal(
        RequestState.Cancelled
      )
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

  describe("proof requirements", function () {
    let period, periodOf, periodEnd

    beforeEach(async function () {
      period = (await marketplace.proofPeriod()).toNumber()
      ;({ periodOf, periodEnd } = periodic(period))

      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, collateral)
      await marketplace.deposit(collateral)
    })

    async function waitUntilProofWillBeRequired(id) {
      while (!(await marketplace.willProofBeRequired(id))) {
        await mine()
      }
    }

    async function waitUntilProofIsRequired(id) {
      await advanceTimeTo(periodEnd(periodOf(await currentTime())))
      while (
        !(
          (await marketplace.isProofRequired(id)) &&
          (await marketplace.getPointer(id)) < 250
        )
      ) {
        await advanceTime(period)
      }
    }

    it("will not require proofs once cancelled", async function () {
      const id = slotId(slot)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilProofWillBeRequired(id)
      await expect(await marketplace.willProofBeRequired(id)).to.be.true
      await advanceTimeTo(request.expiry + 1)
      await expect(await marketplace.willProofBeRequired(id)).to.be.false
    })

    it("does not require proofs once cancelled", async function () {
      const id = slotId(slot)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilProofIsRequired(id)
      await expect(await marketplace.isProofRequired(id)).to.be.true
      await advanceTimeTo(request.expiry + 1)
      await expect(await marketplace.isProofRequired(id)).to.be.false
    })

    it("does not provide challenges once cancelled", async function () {
      const id = slotId(slot)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilProofIsRequired(id)
      const challenge1 = await marketplace.getChallenge(id)
      expect(BigNumber.from(challenge1).gt(0))
      await advanceTimeTo(request.expiry + 1)
      const challenge2 = await marketplace.getChallenge(id)
      expect(BigNumber.from(challenge2).isZero())
    })

    it("does not provide pointer once cancelled", async function () {
      const id = slotId(slot)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilProofIsRequired(id)
      const challenge1 = await marketplace.getChallenge(id)
      expect(BigNumber.from(challenge1).gt(0))
      await advanceTimeTo(request.expiry + 1)
      const challenge2 = await marketplace.getChallenge(id)
      expect(BigNumber.from(challenge2).isZero())
    })
  })

  describe("missing proofs", function () {
    let period, periodOf, periodEnd

    beforeEach(async function () {
      period = (await marketplace.proofPeriod()).toNumber()
      ;({ periodOf, periodEnd } = periodic(period))

      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, collateral)
      await marketplace.deposit(collateral)
    })

    async function waitUntilProofIsRequired(id) {
      await advanceTimeTo(periodEnd(periodOf(await currentTime())))
      while (
        !(
          (await marketplace.isProofRequired(id)) &&
          (await marketplace.getPointer(id)) < 250
        )
      ) {
        await advanceTime(period)
      }
    }

    it("fails to mark proof as missing when cancelled", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(request)
      let missedPeriod = periodOf(await currentTime())
      await expect(
        marketplace.markProofAsMissing(slotId(slot), missedPeriod)
      ).to.be.revertedWith("Slot not accepting proofs")
    })

    describe("slashing when missing proofs", function () {
      it("reduces collateral when too many proofs are missing", async function () {
        const id = slotId(slot)
        await marketplace.fillSlot(slot.request, slot.index, proof)
        for (let i = 0; i < slashMisses; i++) {
          await waitUntilProofIsRequired(id)
          let missedPeriod = periodOf(await currentTime())
          await advanceTime(period)
          await marketplace.markProofAsMissing(id, missedPeriod)
        }
        const expectedBalance = (collateral * (100 - slashPercentage)) / 100
        expect(await marketplace.balanceOf(host.address)).to.equal(
          expectedBalance
        )
      })
    })

    describe("freeing a slot", function () {
      it("frees slot when collateral slashed below minimum threshold", async function () {
        const id = slotId(slot)

        await waitUntilStarted(marketplace, request, proof)

        // max slashes before dropping below collateral threshold
        const maxSlashes = 10
        for (let i = 0; i < maxSlashes; i++) {
          for (let j = 0; j < slashMisses; j++) {
            await waitUntilProofIsRequired(id)
            let missedPeriod = periodOf(await currentTime())
            await advanceTime(period)
            if (i === maxSlashes - 1 && j === slashMisses - 1) {
              await expect(
                await marketplace.markProofAsMissing(id, missedPeriod)
              ).to.emit(marketplace, "SlotFreed")
              expect(await marketplace.getHost(id)).to.equal(AddressZero)
            } else {
              await marketplace.markProofAsMissing(id, missedPeriod)
            }
          }
        }
      })
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
      it("fails when request Cancelled", async function () {
        await marketplace.fillSlot(slot.request, slot.index, proof)
        await waitUntilCancelled(request)
        await expect(
          marketplace.testAcceptsProofs(slotId(slot))
        ).to.be.revertedWith("Slot not accepting proofs")
      })

      it("fails when request Finished", async function () {
        await waitUntilStarted(marketplace, request, proof)
        await waitUntilFinished(marketplace, requestId(request))
        await expect(
          marketplace.testAcceptsProofs(slotId(slot))
        ).to.be.revertedWith("Slot not accepting proofs")
      })

      it("fails when request Failed", async function () {
        await waitUntilStarted(marketplace, request, proof)
        await waitUntilFailed(marketplace, request)
        await expect(
          marketplace.testAcceptsProofs(slotId(slot))
        ).to.be.revertedWith("Slot empty")
      })
    })
  })

  describe("list of active requests", function () {
    beforeEach(async function () {
      switchAccount(host)
      await token.approve(marketplace.address, collateral)
      await marketplace.deposit(collateral)
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
    })

    it("adds request to list when requesting storage", async function () {
      await marketplace.requestStorage(request)
      expect(await marketplace.myRequests()).to.deep.equal([requestId(request)])
    })

    it("keeps request in list when cancelled", async function () {
      await marketplace.requestStorage(request)
      await waitUntilCancelled(request)
      expect(await marketplace.myRequests()).to.deep.equal([requestId(request)])
    })

    it("removes request from list when funds are withdrawn", async function () {
      await marketplace.requestStorage(request)
      await waitUntilCancelled(request)
      await marketplace.withdrawFunds(requestId(request))
      expect(await marketplace.myRequests()).to.deep.equal([])
    })

    it("keeps request in list when request fails", async function () {
      await marketplace.requestStorage(request)
      switchAccount(host)
      await waitUntilStarted(marketplace, request, proof)
      await waitUntilFailed(marketplace, request)
      switchAccount(client)
      expect(await marketplace.myRequests()).to.deep.equal([requestId(request)])
    })

    it("removes request from list when request finishes", async function () {
      await marketplace.requestStorage(request)
      switchAccount(host)
      await waitUntilStarted(marketplace, request, proof)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      switchAccount(client)
      expect(await marketplace.myRequests()).to.deep.equal([])
    })
  })

  describe("list of active slots", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, collateral)
      await marketplace.deposit(collateral)
    })

    it("adds slot to list when filling slot", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      let slot1 = { ...slot, index: slot.index + 1 }
      await marketplace.fillSlot(slot.request, slot1.index, proof)
      expect(await marketplace.mySlots()).to.have.members([
        slotId(slot),
        slotId(slot1),
      ])
    })

    it("removes slot from list when slot is freed", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      let slot1 = { ...slot, index: slot.index + 1 }
      await marketplace.fillSlot(slot.request, slot1.index, proof)
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.mySlots()).to.have.members([slotId(slot1)])
    })

    it("keeps slots when cancelled", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      let slot1 = { ...slot, index: slot.index + 1 }
      await marketplace.fillSlot(slot.request, slot1.index, proof)
      await waitUntilCancelled(request)
      expect(await marketplace.mySlots()).to.have.members([
        slotId(slot),
        slotId(slot1),
      ])
    })

    it("removes slot when finished slot is freed", async function () {
      await waitUntilStarted(marketplace, request, proof)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.mySlots()).to.not.contain(slotId(slot))
    })

    it("removes slot when cancelled slot is freed", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(request)
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.mySlots()).to.not.contain(slotId(slot))
    })

    it("removes slot when failed slot is freed", async function () {
      await waitUntilStarted(marketplace, request, proof)
      await waitUntilSlotFailed(marketplace, request, slot)
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.mySlots()).to.not.contain(slotId(slot))
    })
  })
})
