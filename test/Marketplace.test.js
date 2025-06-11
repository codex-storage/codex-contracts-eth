const { ethers } = require("hardhat")
const { AddressZero } = ethers.constants
const { BigNumber } = ethers
const { expect } = require("chai")
const {
  exampleConfiguration,
  exampleRequest,
  exampleProof,
  invalidProof,
} = require("./examples")
const { periodic, hours } = require("./time")
const { requestId, slotId, askToArray } = require("./ids")
const {
  RequestState,
  SlotState,
  enableRequestAssertions,
} = require("./requests")
const {
  waitUntilCancelled,
  waitUntilStarted,
  waitUntilFinished,
  waitUntilFailed,
  waitUntilSlotFailed,
  patchOverloads,
} = require("./marketplace")
const {
  maxPrice,
  pricePerSlotPerSecond,
  payoutForDuration,
} = require("./price")
const { collateralPerSlot, repairReward } = require("./collateral")
const {
  snapshot,
  revert,
  ensureMinimumBlockHeight,
  advanceTime,
  advanceTimeTo,
  currentTime,
  setNextBlockTimestamp,
} = require("./evm")
const { arrayify } = require("ethers/lib/utils")

describe("Marketplace constructor", function () {
  let Marketplace, token, vault, verifier, config

  beforeEach(async function () {
    await snapshot()
    await ensureMinimumBlockHeight(256)

    const TestToken = await ethers.getContractFactory("TestToken")
    token = await TestToken.deploy()

    const Vault = await ethers.getContractFactory("Vault")
    vault = await Vault.deploy(token.address)

    const TestVerifier = await ethers.getContractFactory("TestVerifier")
    verifier = await TestVerifier.deploy()

    Marketplace = await ethers.getContractFactory("TestMarketplace")
    config = exampleConfiguration()
  })

  afterEach(async function () {
    await revert()
  })

  function testPercentageOverflow(property, expectedError) {
    it(`should reject for ${property} overflowing percentage values`, async () => {
      config.collateral[property] = 101

      await expect(
        Marketplace.deploy(config, vault.address, verifier.address)
      ).to.be.revertedWith(expectedError)
    })
  }

  testPercentageOverflow(
    "repairRewardPercentage",
    "Marketplace_RepairRewardPercentageTooHigh"
  )
  testPercentageOverflow(
    "slashPercentage",
    "Marketplace_SlashPercentageTooHigh"
  )

  it("should reject when total slash percentage exceeds 100%", async () => {
    config.collateral.slashPercentage = 1
    config.collateral.maxNumberOfSlashes = 101

    await expect(
      Marketplace.deploy(config, vault.address, verifier.address)
    ).to.be.revertedWith("Marketplace_MaximumSlashingTooHigh")
  })
})

describe("Marketplace", function () {
  const proof = exampleProof()
  const config = exampleConfiguration()

  let marketplace
  let token
  let vault
  let verifier
  let client, host, host1, host2, host3, validator
  let request
  let slot

  enableRequestAssertions()

  beforeEach(async function () {
    await snapshot()
    await ensureMinimumBlockHeight(256)
    ;[client, host1, host2, host3, validator] = await ethers.getSigners()
    host = host1

    const TestToken = await ethers.getContractFactory("TestToken")
    token = await TestToken.deploy()
    for (let account of [client, host1, host2, host3, validator]) {
      await token.mint(account.address, 1_000_000_000_000_000)
    }

    const Vault = await ethers.getContractFactory("Vault")
    vault = await Vault.deploy(token.address)

    const TestVerifier = await ethers.getContractFactory("TestVerifier")
    verifier = await TestVerifier.deploy()

    const Marketplace = await ethers.getContractFactory("TestMarketplace")
    marketplace = await Marketplace.deploy(
      config,
      vault.address,
      verifier.address
    )
    patchOverloads(marketplace)

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
    patchOverloads(marketplace)
  }

  describe("requesting storage", function () {
    beforeEach(function () {
      switchAccount(client)
    })

    it("emits event when storage is requested", async function () {
      await token.approve(marketplace.address, maxPrice(request))
      const now = await currentTime()
      await setNextBlockTimestamp(now)
      const expectedExpiry = now + request.expiry
      await expect(marketplace.requestStorage(request))
        .to.emit(marketplace, "StorageRequested")
        .withArgs(requestId(request), askToArray(request.ask), expectedExpiry)
    })

    it("allows retrieval of request details", async function () {
      await token.approve(marketplace.address, maxPrice(request))
      await marketplace.requestStorage(request)
      const id = requestId(request)
      expect(await marketplace.getRequest(id)).to.be.request(request)
    })

    it("rejects request with invalid client address", async function () {
      let invalid = { ...request, client: host.address }
      await token.approve(marketplace.address, maxPrice(invalid))
      await expect(marketplace.requestStorage(invalid)).to.be.revertedWith(
        "Marketplace_InvalidClientAddress"
      )
    })

    it("rejects request with duration exceeding limit", async function () {
      request.ask.duration = config.requestDurationLimit + 1
      await token.approve(marketplace.address, collateralPerSlot(request))
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "Marketplace_DurationExceedsLimit"
      )
    })

    it("rejects request with insufficient payment", async function () {
      let insufficient = maxPrice(request) - 1
      await token.approve(marketplace.address, insufficient)
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "ERC20InsufficientAllowance"
      )
    })

    it("rejects request when expiry out of bounds", async function () {
      await token.approve(marketplace.address, maxPrice(request))

      request.expiry = request.ask.duration + 1
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "Marketplace_InvalidExpiry"
      )

      request.expiry = 0
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "Marketplace_InvalidExpiry"
      )
    })

    it("is rejected with insufficient slots ", async function () {
      request.ask.slots = 0
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "Marketplace_InsufficientSlots"
      )
    })

    it("is rejected when maxSlotLoss exceeds slots", async function () {
      request.ask.maxSlotLoss = request.ask.slots + 1
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "Marketplace_InvalidMaxSlotLoss"
      )
    })

    it("rejects resubmission of request", async function () {
      await token.approve(marketplace.address, maxPrice(request) * 2)
      await marketplace.requestStorage(request)
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "Marketplace_RequestAlreadyExists"
      )
    })

    it("is rejected when insufficient duration", async function () {
      request.ask.duration = 0
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        // request.expiry has to be > 0 and
        // request.expiry < request.ask.duration
        // so request.ask.duration will trigger "Marketplace_InvalidExpiry"
        "Marketplace_InvalidExpiry"
      )
    })

    it("is rejected when insufficient proofProbability", async function () {
      request.ask.proofProbability = 0
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "Marketplace_InsufficientProofProbability"
      )
    })

    it("is rejected when insufficient collateral", async function () {
      request.ask.collateralPerByte = 0
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "Marketplace_InsufficientCollateral"
      )
    })

    it("is rejected when insufficient reward", async function () {
      request.ask.pricePerBytePerSecond = 0
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "Marketplace_InsufficientReward"
      )
    })

    it("is rejected when cid is missing", async function () {
      request.content.cid = []
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "Marketplace_InvalidCid"
      )
    })
  })

  describe("filling a slot", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, collateralPerSlot(request))
    })

    it("emits event when slot is filled", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await expect(marketplace.fillSlot(slot.request, slot.index, proof))
        .to.emit(marketplace, "SlotFilled")
        .withArgs(slot.request, slot.index)
    })

    it("allows retrieval of host that filled slot", async function () {
      expect(await marketplace.getHost(slotId(slot))).to.equal(AddressZero)
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      expect(await marketplace.getHost(slotId(slot))).to.equal(host.address)
    })

    it("collects only requested collateral and not more", async function () {
      await token.approve(marketplace.address, collateralPerSlot(request) * 2)
      const startBalance = await token.balanceOf(host.address)
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      const endBalance = await token.balanceOf(host.address)
      expect(startBalance - endBalance).to.eq(collateralPerSlot(request))
    })

    describe("when repairing a slot", function () {
      beforeEach(async function () {
        await marketplace.reserveSlot(slot.request, slot.index)
        await marketplace.fillSlot(slot.request, slot.index, proof)
        await advanceTime(config.proofs.period + 1)
        await marketplace.freeSlot(slotId(slot))
      })

      it("tops up the host collateral with the repair reward", async function () {
        const collateral = collateralPerSlot(request)
        const reward = repairReward(config, collateral)
        await token.approve(marketplace.address, collateral)
        await marketplace.reserveSlot(slot.request, slot.index)

        const startBalance = await marketplace.getSlotBalance(slotId(slot))
        await marketplace.fillSlot(slot.request, slot.index, proof)
        const endBalance = await marketplace.getSlotBalance(slotId(slot))

        expect(endBalance - startBalance).to.equal(collateral + reward)
      })
    })

    it("updates the slot's current collateral", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      const collateral = await marketplace.currentCollateral(slotId(slot))
      expect(collateral).to.equal(collateralPerSlot(request))
    })

    it("fails to retrieve a request of an empty slot", async function () {
      expect(marketplace.getActiveSlot(slotId(slot))).to.be.revertedWith(
        "Marketplace_SlotIsFree"
      )
    })

    it("allows retrieval of request of a filled slot", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      let activeSlot = await marketplace.getActiveSlot(slotId(slot))
      expect(activeSlot.request).to.be.request(request)
      expect(activeSlot.slotIndex).to.equal(slot.index)
    })

    it("is rejected when proof is incorrect", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await expect(
        marketplace.fillSlot(slot.request, slot.index, invalidProof())
      ).to.be.revertedWith("Proofs_InvalidProof")
    })

    it("is rejected when slot already filled", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof)
      ).to.be.revertedWith("Marketplace_SlotNotFree")
    })

    it("is rejected when request is unknown", async function () {
      let unknown = await exampleRequest()
      await expect(
        marketplace.fillSlot(requestId(unknown), 0, proof)
      ).to.be.revertedWith("Marketplace_UnknownRequest")
    })

    it("is rejected when request is cancelled", async function () {
      switchAccount(client)
      let expired = { ...request, expiry: hours(1) + 1 }
      await token.approve(marketplace.address, maxPrice(request))
      await marketplace.requestStorage(expired)
      await waitUntilCancelled(marketplace, expired)
      switchAccount(host)
      await marketplace.reserveSlot(requestId(expired), slot.index)
      await expect(
        marketplace.fillSlot(requestId(expired), slot.index, proof)
      ).to.be.revertedWith("Marketplace_SlotNotFree")
    })

    it("is rejected when request is finished", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, slot.request)
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof)
      ).to.be.revertedWith("Marketplace_SlotNotFree")
    })

    it("is rejected when request is failed", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFailed(marketplace, request)
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof)
      ).to.be.revertedWith("Marketplace_ReservationRequired")
    })

    it("is rejected when slot index not in range", async function () {
      const invalid = request.ask.slots
      await expect(
        marketplace.fillSlot(slot.request, invalid, proof)
      ).to.be.revertedWith("Marketplace_InvalidSlot")
    })

    it("fails when all slots are already filled", async function () {
      const lastSlot = request.ask.slots - 1
      await token.approve(
        marketplace.address,
        collateralPerSlot(request) * lastSlot
      )
      await token.approve(marketplace.address, maxPrice(request) * lastSlot)
      for (let i = 0; i <= lastSlot; i++) {
        await marketplace.reserveSlot(slot.request, i)
        await marketplace.fillSlot(slot.request, i, proof)
      }
      await expect(
        marketplace.fillSlot(slot.request, lastSlot, proof)
      ).to.be.revertedWith("Marketplace_SlotNotFree")
    })

    it("fails if slot is not reserved first", async function () {
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof)
      ).to.be.revertedWith("Marketplace_ReservationRequired")
    })

    it("fails when approved collateral is insufficient", async function () {
      let insufficient = collateralPerSlot(request) - 1
      await token.approve(marketplace.address, insufficient)
      await marketplace.reserveSlot(slot.request, slot.index)
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof)
      ).to.be.revertedWith("ERC20InsufficientAllowance")
    })
  })

  describe("submitting proofs when slot is filled", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral)
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await advanceTime(config.proofs.period)
    })

    it("allows proofs to be submitted", async function () {
      await marketplace.submitProof(slotId(slot), proof)
    })

    it("reverts when somebody other then host submit the proof", async function () {
      switchAccount(host2)
      await expect(
        marketplace.submitProof(slotId(slot), proof)
      ).to.be.revertedWith("Marketplace_ProofNotSubmittedByHost")
    })

    it("converts first 31 bytes of challenge to field element", async function () {
      let challenge = arrayify(await marketplace.getChallenge(slotId(slot)))
      let truncated = challenge.slice(0, 31)
      let littleEndian = new Uint8Array(truncated).reverse()
      let expected = BigNumber.from(littleEndian)
      expect(await marketplace.challengeToFieldElement(challenge)).to.equal(
        expected
      )
    })

    it("converts merkle root to field element", async function () {
      let merkleRoot = request.content.merkleRoot
      let littleEndian = new Uint8Array(merkleRoot).reverse()
      let expected = BigNumber.from(littleEndian)
      expect(await marketplace.merkleRootToFieldElement(merkleRoot)).to.equal(
        expected
      )
    })
  })

  describe("request end", function () {
    var requestTime
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, maxPrice(request))
      await marketplace.requestStorage(request)
      requestTime = await currentTime()
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral)
    })

    it("sets the request end time to now + duration", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await expect(await marketplace.requestEnd(requestId(request))).to.equal(
        requestTime + request.ask.duration
      )
    })

    it("sets request end time to the past once cancelled", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(marketplace, request)
      const now = await currentTime()
      await expect(await marketplace.requestEnd(requestId(request))).to.be.eq(
        now - 1
      )
    })

    it("checks that request end time is in the past once finished", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      const now = await currentTime()
      await expect(await marketplace.requestEnd(requestId(request))).to.be.eq(
        now - 1
      )
    })
  })

  describe("freeing a slot", function () {
    let id
    let collateral

    beforeEach(async function () {
      slot.index = 0
      id = slotId(slot)
      period = config.proofs.period
      ;({ periodOf, periodEnd } = periodic(period))

      switchAccount(client)
      await token.approve(marketplace.address, maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral)
    })

    it("fails to free slot when slot not filled", async function () {
      slot.index = 5
      let nonExistentId = slotId(slot)
      await expect(marketplace.freeSlot(nonExistentId)).to.be.revertedWith(
        "Marketplace_SlotIsFree"
      )
    })

    it("can only be freed by the host occupying the slot", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      switchAccount(client)
      await expect(marketplace.freeSlot(id)).to.be.revertedWith(
        "Marketplace_InvalidSlotHost"
      )
    })

    it("successfully frees slot", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await expect(marketplace.freeSlot(id)).not.to.be.reverted
    })

    it("emits event once slot is freed", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await expect(await marketplace.freeSlot(id))
        .to.emit(marketplace, "SlotFreed")
        .withArgs(slot.request, slot.index)
    })

    it("can reserve and fill a freed slot", async function () {
      // Make a reservation from another host
      switchAccount(host2)
      collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral)
      await marketplace.reserveSlot(slot.request, slot.index)

      // Switch host and free the slot
      switchAccount(host)
      await waitUntilStarted(marketplace, request, proof, token)
      await marketplace.freeSlot(id)

      // At this point, the slot should be freed and in a repair state.
      // Another host should be able to make a reservation for this
      // slot and fill it.
      switchAccount(host2)
      await marketplace.reserveSlot(slot.request, slot.index)
      let currPeriod = periodOf(await currentTime())
      await advanceTimeTo(periodEnd(currPeriod) + 1)
      await token.approve(marketplace.address, collateral)
      await marketplace.fillSlot(slot.request, slot.index, proof)
    })

    it("updates the slot's current collateral", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await marketplace.freeSlot(id)
      expect(await marketplace.currentCollateral(id)).to.equal(0)
    })
  })

  describe("paying out a slot", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral)
    })

    it("pays out finished request based on time hosted", async function () {
      // We are advancing the time because most of the slots will be filled somewhere
      // in the "expiry window" and not at its beginning. This is more "real" setup
      // and demonstrates the partial payout feature better.
      await advanceTime(request.expiry / 2)

      const expectedPayouts = await waitUntilStarted(
        marketplace,
        request,
        proof,
        token
      )
      await waitUntilFinished(marketplace, requestId(request))

      const startBalanceHost = await token.balanceOf(host.address)
      await marketplace.freeSlot(slotId(slot))
      const endBalanceHost = await token.balanceOf(host.address)

      const collateral = collateralPerSlot(request)
      expect(endBalanceHost - startBalanceHost).to.equal(
        expectedPayouts[slot.index] + collateral
      )
    })

    it("pays the host when contract was cancelled", async function () {
      // Lets advance the time more into the expiry window
      const filledAt = (await currentTime()) + Math.floor(request.expiry / 3)
      const expiresAt = await marketplace.requestExpiry(requestId(request))

      const startBalance = await token.balanceOf(host.address)
      await marketplace.reserveSlot(slot.request, slot.index)
      await setNextBlockTimestamp(filledAt)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(marketplace, request)
      await marketplace.freeSlot(slotId(slot))
      const endBalance = await token.balanceOf(host.address)

      const expectedPartialPayout =
        (expiresAt - filledAt) * pricePerSlotPerSecond(request)
      expect(endBalance - startBalance).to.be.equal(expectedPartialPayout)
    })

    it("pays the host when contract fails and then finishes", async function () {
      await advanceTime(10)
      await waitUntilStarted(marketplace, request, proof, token)
      const filledAt = await currentTime()

      await advanceTime(10)
      await waitUntilSlotFailed(marketplace, request, slot)
      const failedAt = await currentTime()

      await advanceTime(10)
      await waitUntilFinished(marketplace, requestId(request))

      const startBalance = await token.balanceOf(host.address)
      await marketplace.freeSlot(slotId(slot))
      const endBalance = await token.balanceOf(host.address)

      const payout = (failedAt - filledAt) * pricePerSlotPerSecond(request)
      const collateral = collateralPerSlot(request)
      expect(endBalance - startBalance).to.equal(payout + collateral)
    })

    it("updates the collateral when freeing a finished slot", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.currentCollateral(slotId(slot))).to.equal(0)
    })

    it("updates the collateral when freeing a cancelled slot", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(marketplace, request)
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.currentCollateral(slotId(slot))).to.equal(0)
    })

    it("updates the collateral when freeing a failed slot", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilSlotFailed(marketplace, request, slot)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.currentCollateral(slotId(slot))).to.equal(0)
    })

    it("does not pay when the contract hasn't ended", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      const startBalance = await token.balanceOf(host.address)
      await marketplace.freeSlot(slotId(slot))
      const endBalance = await token.balanceOf(host.address)
      expect(endBalance).to.equal(startBalance)
    })

    it("does not pay for a failed slot when the contract hasn't ended", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilSlotFailed(marketplace, request, slot)
      await expect(marketplace.freeSlot(slotId(slot))).to.be.revertedWith(
        "VaultFundNotUnlocked"
      )
    })

    it("does not pay host that made the request fail", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      for (let i = 0; i <= request.ask.maxSlotLoss; i++) {
        slot.index = i
        await marketplace.freeSlot(slotId(slot))
      }
      await waitUntilFinished(marketplace, requestId(request))
      await expect(marketplace.freeSlot(slotId(slot))).to.be.revertedWith(
        "Marketplace_InvalidSlotHost"
      )
    })

    it("pays only once", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      const startBalance = await token.balanceOf(host.address)
      await marketplace.freeSlot(slotId(slot))
      const endBalance = await token.balanceOf(host.address)
      expect(endBalance).to.equal(startBalance)
    })

    it("cannot be filled again", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      await expect(marketplace.fillSlot(slot.request, slot.index, proof)).to.be
        .reverted
    })
  })

  describe("fulfilling a request", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral)
    })

    it("emits event when all slots are filled", async function () {
      const lastSlot = request.ask.slots - 1
      await token.approve(
        marketplace.address,
        collateralPerSlot(request) * lastSlot
      )
      for (let i = 0; i < lastSlot; i++) {
        await marketplace.reserveSlot(slot.request, i)
        await marketplace.fillSlot(slot.request, i, proof)
      }

      const collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral)
      await marketplace.reserveSlot(slot.request, lastSlot)
      await expect(marketplace.fillSlot(slot.request, lastSlot, proof))
        .to.emit(marketplace, "RequestFulfilled")
        .withArgs(requestId(request))
    })
    it("sets state when all slots are filled", async function () {
      const slots = request.ask.slots
      const collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral * slots)
      for (let i = 0; i < slots; i++) {
        await marketplace.reserveSlot(slot.request, i)
        await marketplace.fillSlot(slot.request, i, proof)
      }
      await expect(await marketplace.requestState(slot.request)).to.equal(
        RequestState.Started
      )
    })
    it("fails when all slots are already filled", async function () {
      const lastSlot = request.ask.slots - 1
      await token.approve(
        marketplace.address,
        collateralPerSlot(request) * (lastSlot + 1)
      )
      for (let i = 0; i <= lastSlot; i++) {
        await marketplace.reserveSlot(slot.request, i)
        await marketplace.fillSlot(slot.request, i, proof)
      }
      await expect(
        marketplace.fillSlot(slot.request, lastSlot, proof)
      ).to.be.revertedWith("Marketplace_SlotNotFree")
    })
  })

  describe("withdrawing funds", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, maxPrice(request))
      await marketplace.requestStorage(request)

      // wait a bit, so that there are funds for the client to withdraw
      await advanceTime(10)

      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral)
    })

    it("rejects withdraw when request not yet timed out", async function () {
      switchAccount(client)
      await expect(marketplace.withdrawFunds(slot.request)).to.be.revertedWith(
        "VaultFundNotUnlocked"
      )
    })

    it("withdraws nothing when wrong account used", async function () {
      await waitUntilCancelled(marketplace, request)

      const startBalance = await token.balanceOf(host.address)
      await marketplace.withdrawFunds(slot.request)
      const endBalance = await token.balanceOf(host.address)

      expect(endBalance - startBalance).to.equal(0)
    })

    it("rejects withdraw when in wrong state", async function () {
      // fill all slots, should change state to RequestState.Started
      const lastSlot = request.ask.slots - 1
      await token.approve(
        marketplace.address,
        collateralPerSlot(request) * (lastSlot + 1)
      )
      for (let i = 0; i <= lastSlot; i++) {
        await marketplace.reserveSlot(slot.request, i)
        await marketplace.fillSlot(slot.request, i, proof)
      }
      await waitUntilCancelled(marketplace, request)
      switchAccount(client)
      await expect(marketplace.withdrawFunds(slot.request)).to.be.revertedWith(
        "VaultFundNotUnlocked"
      )
    })

    it("rejects withdraw for failed request before request end", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFailed(marketplace, request)
      switchAccount(client)
      await expect(marketplace.withdrawFunds(slot.request)).to.be.revertedWith(
        "VaultFundNotUnlocked"
      )
    })

    it("does not withdraw more than once", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      switchAccount(client)
      await marketplace.withdrawFunds(slot.request)

      const startBalance = await token.balanceOf(client.address)
      await marketplace.withdrawFunds(slot.request)
      const endBalance = await token.balanceOf(client.address)

      expect(endBalance - startBalance).to.equal(0)
    })

    it("withdraw rest of funds to the client for finished requests", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))

      switchAccount(client)
      const startBalance = await token.balanceOf(client.address)
      await marketplace.withdrawFunds(slot.request)

      const endBalance = await token.balanceOf(client.address)

      // As all the request's slots will get filled and request will start and successfully finishes,
      // then the upper bound to how much the client gets returned is the cumulative reward for all the
      // slots for expiry window. This limit is "inclusive" because it is possible that all slots are filled
      // at the time of expiry and hence the user would get the full "expiry window" reward back.
      expect(endBalance - startBalance).to.be.gt(0)
      expect(endBalance - startBalance).to.be.lte(
        request.expiry * pricePerSlotPerSecond(request)
      )
    })

    it("withdraws to the client when request is cancelled", async function () {
      await waitUntilCancelled(marketplace, request)
      switchAccount(client)
      const startBalance = await token.balanceOf(client.address)
      await marketplace.withdrawFunds(slot.request)
      const endBalance = await token.balanceOf(client.address)
      expect(endBalance - startBalance).to.equal(maxPrice(request))
    })

    it("refunds the client for the remaining time when request fails", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFailed(marketplace, request)
      const failedAt = await currentTime()
      await waitUntilFinished(marketplace, requestId(request))
      const finishedAt = await currentTime()

      switchAccount(client)

      const startBalance = await token.balanceOf(client.address)
      await marketplace.withdrawFunds(slot.request)
      const endBalance = await token.balanceOf(client.address)

      const expectedRefund =
        (finishedAt - failedAt) *
        request.ask.slots *
        pricePerSlotPerSecond(request)
      expect(endBalance - startBalance).to.be.gte(expectedRefund)
    })

    it("withdraws to the client for cancelled requests lowered by hosts payout", async function () {
      // Lets advance the time more into the expiry window
      const filledAt = (await currentTime()) + Math.floor(request.expiry / 3)
      const expiresAt = await marketplace.requestExpiry(requestId(request))

      await marketplace.reserveSlot(slot.request, slot.index)
      await setNextBlockTimestamp(filledAt)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(marketplace, request)
      const expectedPartialHostReward =
        (expiresAt - filledAt) * pricePerSlotPerSecond(request)

      switchAccount(client)
      const startBalance = await token.balanceOf(client.address)
      await marketplace.withdrawFunds(slot.request)
      const endBalance = await token.balanceOf(client.address)
      expect(endBalance - startBalance).to.equal(
        maxPrice(request) - expectedPartialHostReward
      )
    })

    it("refunds the client when slot is freed and not repaired", async function () {
      const payouts = await waitUntilStarted(marketplace, request, proof, token)
      await advanceTime(10)
      await marketplace.freeSlot(slotId(slot))
      const freedAt = await currentTime()
      const requestEnd = await marketplace.requestEnd(requestId(request))
      await waitUntilFinished(marketplace, requestId(request))

      switchAccount(client)
      const startBalance = await token.balanceOf(client.address)
      await marketplace.withdrawFunds(slot.request)
      const endBalance = await token.balanceOf(client.address)

      const hostPayouts = payouts.reduce((a, b) => a + b, 0)
      const refund = payoutForDuration(request, freedAt, requestEnd)
      const reward = repairReward(config, collateralPerSlot(request))
      expect(endBalance - startBalance).to.equal(
        maxPrice(request) - hostPayouts + refund + reward
      )
    })
  })

  describe("request state", function () {
    const { New, Cancelled, Started, Failed, Finished } = RequestState

    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral)
    })

    it("is 'New' initially", async function () {
      expect(await marketplace.requestState(slot.request)).to.equal(New)
    })

    it("changes to 'Cancelled' once request is cancelled", async function () {
      await waitUntilCancelled(marketplace, request)
      expect(await marketplace.requestState(slot.request)).to.equal(Cancelled)
    })

    it("remains 'Cancelled' when client withdraws funds", async function () {
      await waitUntilCancelled(marketplace, request)
      switchAccount(client)
      await marketplace.withdrawFunds(slot.request)
      expect(await marketplace.requestState(slot.request)).to.equal(Cancelled)
    })

    it("changes to 'Started' once all slots are filled", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      expect(await marketplace.requestState(slot.request)).to.equal(Started)
    })

    it("changes to 'Failed' once too many slots are freed", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFailed(marketplace, request)
      expect(await marketplace.requestState(slot.request)).to.equal(Failed)
    })

    it("does not change to 'Failed' before it is started", async function () {
      await token.approve(
        marketplace.address,
        collateralPerSlot(request) * (request.ask.maxSlotLoss + 1)
      )
      for (let i = 0; i <= request.ask.maxSlotLoss; i++) {
        await marketplace.reserveSlot(slot.request, i)
        await marketplace.fillSlot(slot.request, i, proof)
      }
      for (let i = 0; i <= request.ask.maxSlotLoss; i++) {
        slot.index = i
        let id = slotId(slot)
        await marketplace.freeSlot(id)
      }
      expect(await marketplace.requestState(slot.request)).to.equal(New)
    })

    it("changes to 'Finished' when the request ends", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      expect(await marketplace.requestState(slot.request)).to.equal(Finished)
    })

    it("remains 'Finished' once a slot is paid out", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.requestState(slot.request)).to.equal(Finished)
    })
  })

  describe("slot state", function () {
    const { Free, Filled, Finished, Failed, Cancelled, Repair } = SlotState
    let period, periodEnd

    beforeEach(async function () {
      period = config.proofs.period
      ;({ periodOf, periodEnd } = periodic(period))

      switchAccount(client)
      await token.approve(marketplace.address, maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral)
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

    it("is 'Free' initially", async function () {
      expect(await marketplace.slotState(slotId(slot))).to.equal(Free)
    })

    it("changes to 'Filled' when slot is filled", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      expect(await marketplace.slotState(slotId(slot))).to.equal(Filled)
    })

    it("changes to 'Finished' when request finishes", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, slot.request)
      expect(await marketplace.slotState(slotId(slot))).to.equal(Finished)
    })

    it("changes to 'Cancelled' when request is cancelled", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(marketplace, request)
      expect(await marketplace.slotState(slotId(slot))).to.equal(Cancelled)
    })

    it("changes to 'Repair' when host frees the slot", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.slotState(slotId(slot))).to.equal(Repair)
    })

    it("changes to 'Repair' when too many proofs are missed", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      while ((await marketplace.slotState(slotId(slot))) === Filled) {
        await waitUntilProofIsRequired(slotId(slot))
        const missedPeriod = periodOf(await currentTime())
        await advanceTime(period + 1)
        await marketplace.markProofAsMissing(slotId(slot), missedPeriod)
      }
      expect(await marketplace.slotState(slotId(slot))).to.equal(Repair)
    })

    it("changes to 'Failed' when request fails", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilSlotFailed(marketplace, request, slot)
      expect(await marketplace.slotState(slotId(slot))).to.equal(Failed)
    })
  })

  describe("slot probability", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral)
    })

    it("calculates correctly the slot probability", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)

      // request.ask.proofProbability  = 4
      // config.proofs.downtime = 64
      // 4 * (256 - 64) / 256
      const expectedProbability = 3
      expect(await marketplace.slotProbability(slotId(slot))).to.equal(
        expectedProbability
      )
    })
  })

  describe("proof requirements", function () {
    let period, periodOf, periodEnd

    beforeEach(async function () {
      period = config.proofs.period
      ;({ periodOf, periodEnd } = periodic(period))

      switchAccount(client)
      await token.approve(marketplace.address, maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral)
    })

    async function waitUntilProofWillBeRequired(id) {
      while (!(await marketplace.willProofBeRequired(id))) {
        await advanceTime(period)
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

    it("requires proofs when slot is filled", async function () {
      const id = slotId(slot)
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilProofWillBeRequired(id)
    })

    it("will not require proofs once cancelled", async function () {
      const id = slotId(slot)
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilProofWillBeRequired(id)
      await expect(await marketplace.willProofBeRequired(id)).to.be.true
      await waitUntilCancelled(marketplace, request)
      await expect(await marketplace.willProofBeRequired(id)).to.be.false
    })

    it("does not require proofs once cancelled", async function () {
      const id = slotId(slot)
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilProofIsRequired(id)
      await expect(await marketplace.isProofRequired(id)).to.be.true
      await waitUntilCancelled(marketplace, request)
      await expect(await marketplace.isProofRequired(id)).to.be.false
    })

    it("does not provide challenges once cancelled", async function () {
      const id = slotId(slot)
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilProofIsRequired(id)
      const challenge1 = await marketplace.getChallenge(id)
      expect(BigNumber.from(challenge1).gt(0))
      await waitUntilCancelled(marketplace, request)
      const challenge2 = await marketplace.getChallenge(id)
      expect(BigNumber.from(challenge2).isZero())
    })

    it("does not provide pointer once cancelled", async function () {
      const id = slotId(slot)
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilProofIsRequired(id)
      const challenge1 = await marketplace.getChallenge(id)
      expect(BigNumber.from(challenge1).gt(0))
      await waitUntilCancelled(marketplace, request)
      const challenge2 = await marketplace.getChallenge(id)
      expect(BigNumber.from(challenge2).isZero())
    })
  })

  describe("missing proofs", function () {
    let period, periodOf, periodEnd

    beforeEach(async function () {
      period = config.proofs.period
      ;({ periodOf, periodEnd } = periodic(period))

      switchAccount(client)
      await token.approve(marketplace.address, maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral)
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
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(marketplace, request)
      let missedPeriod = periodOf(await currentTime())
      await expect(
        marketplace.markProofAsMissing(slotId(slot), missedPeriod)
      ).to.be.revertedWith("Marketplace_SlotNotAcceptingProofs")
    })

    describe("slashing when missing proofs", function () {
      const { slashPercentage, validatorRewardPercentage } = config.collateral
      let id
      let missedPeriod
      let collateral
      let slashAmount

      beforeEach(async function () {
        collateral = collateralPerSlot(request)
        slashAmount = Math.round((collateral * slashPercentage) / 100)
        id = slotId(slot)
        await marketplace.reserveSlot(slot.request, slot.index)
        await marketplace.fillSlot(slot.request, slot.index, proof)
        await waitUntilProofIsRequired(id)
        missedPeriod = periodOf(await currentTime())
        await advanceTime(period + 1)
      })

      it("reduces balance when a proof is missing", async function () {
        const startBalance = await marketplace.getSlotBalance(id)
        await setNextBlockTimestamp(await currentTime())
        await marketplace.markProofAsMissing(id, missedPeriod)
        const endBalance = await marketplace.getSlotBalance(id)
        expect(endBalance).to.equal(startBalance - slashAmount)
      })

      it("updates the slot's current collateral", async function () {
        await setNextBlockTimestamp(await currentTime())
        await marketplace.markProofAsMissing(id, missedPeriod)
        const currentCollateral = await marketplace.currentCollateral(id)
        expect(currentCollateral).to.equal(collateral - slashAmount)
      })

      it("rewards validator when marking proof as missing", async function () {
        switchAccount(validator)
        await marketplace.markProofAsMissing(id, missedPeriod)

        const startBalance = await token.balanceOf(validator.address)
        await waitUntilFinished(marketplace, slot.request)
        await marketplace.withdrawByValidator(slot.request)
        const endBalance = await token.balanceOf(validator.address)

        const expectedReward = Math.round(
          (slashAmount * validatorRewardPercentage) / 100
        )

        expect(endBalance.toNumber()).to.equal(
          startBalance.toNumber() + expectedReward
        )
      })
    })

    describe("when slashing the maximum number of times", function () {
      beforeEach(async function () {
        await waitUntilStarted(marketplace, request, proof, token)
        for (let i = 0; i < config.collateral.maxNumberOfSlashes; i++) {
          await waitUntilProofIsRequired(slotId(slot))
          const missedPeriod = periodOf(await currentTime())
          await advanceTime(period + 1)
          await marketplace.markProofAsMissing(slotId(slot), missedPeriod)
        }
      })

      it("sets the state to 'repair'", async function () {
        expect(await marketplace.slotState(slotId(slot))).to.equal(
          SlotState.Repair
        )
      })

      it("burns the balance", async function () {
        expect(await marketplace.getSlotBalance(slotId(slot))).to.equal(0)
      })

      it("updates the slot's current collateral", async function () {
        const collateral = await marketplace.currentCollateral(slotId(slot))
        expect(collateral).to.equal(0)
      })

      it("resets missed proof counter", async function () {
        expect(await marketplace.missingProofs(slotId(slot))).to.equal(0)
      })
    })
  })

  describe("list of active requests", function () {
    beforeEach(async function () {
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral)
      switchAccount(client)
      await token.approve(marketplace.address, maxPrice(request))
    })

    it("adds request to list when requesting storage", async function () {
      await marketplace.requestStorage(request)
      expect(await marketplace.myRequests()).to.deep.equal([requestId(request)])
    })

    it("keeps request in list when cancelled", async function () {
      await marketplace.requestStorage(request)
      await waitUntilCancelled(marketplace, request)
      expect(await marketplace.myRequests()).to.deep.equal([requestId(request)])
    })

    it("removes request from list when funds are withdrawn", async function () {
      await marketplace.requestStorage(request)
      await waitUntilCancelled(marketplace, request)
      await marketplace.withdrawFunds(requestId(request))
      expect(await marketplace.myRequests()).to.deep.equal([])
    })

    it("keeps request in list when request fails", async function () {
      await marketplace.requestStorage(request)
      switchAccount(host)
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFailed(marketplace, request)
      switchAccount(client)
      expect(await marketplace.myRequests()).to.deep.equal([requestId(request)])
    })
  })

  describe("list of active slots", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral)
    })

    it("adds slot to list when filling slot", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      let slot1 = { ...slot, index: slot.index + 1 }
      const collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral)
      await marketplace.reserveSlot(slot.request, slot1.index)
      await marketplace.fillSlot(slot.request, slot1.index, proof)
      expect(await marketplace.mySlots()).to.have.members([
        slotId(slot),
        slotId(slot1),
      ])
    })

    it("removes slot from list when slot is freed", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      let slot1 = { ...slot, index: slot.index + 1 }
      const collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral)
      await marketplace.reserveSlot(slot.request, slot1.index)
      await marketplace.fillSlot(slot.request, slot1.index, proof)
      await token.approve(marketplace.address, collateral)
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.mySlots()).to.have.members([slotId(slot1)])
    })

    it("keeps slots when cancelled", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      let slot1 = { ...slot, index: slot.index + 1 }

      const collateral = collateralPerSlot(request)
      await token.approve(marketplace.address, collateral)
      await marketplace.reserveSlot(slot.request, slot1.index)
      await marketplace.fillSlot(slot.request, slot1.index, proof)
      await waitUntilCancelled(marketplace, request)
      expect(await marketplace.mySlots()).to.have.members([
        slotId(slot),
        slotId(slot1),
      ])
    })

    it("removes slot when finished slot is freed", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.mySlots()).to.not.contain(slotId(slot))
    })

    it("removes slot when cancelled slot is freed", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(marketplace, request)
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.mySlots()).to.not.contain(slotId(slot))
    })

    it("removes slot when failed slot is freed", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilSlotFailed(marketplace, request, slot)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.mySlots()).to.not.contain(slotId(slot))
    })
  })
})
