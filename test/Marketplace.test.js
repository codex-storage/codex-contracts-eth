const { ethers, ignition } = require("hardhat")
const { ZeroAddress } = ethers
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
  littleEndianToBigInt,
} = require("./marketplace")
const {
  maxPrice,
  pricePerSlotPerSecond,
  calculatePartialPayout,
  calculateBalance,
} = require("./price")
const { collateralPerSlot } = require("./collateral")
const {
  ensureMinimumBlockHeight,
  advanceTime,
  advanceTimeTo,
  currentTime,
  snapshot,
  revert,
  setNextBlockTimestamp,
} = require("./evm")
const { getBytes } = require("ethers")
const MarketplaceModule = require("../ignition/modules/marketplace")
const MarketplaceUpgradeModule = require("../ignition/modules/marketplace-test-upgrade")
const { assertDeploymentRejectedWithCustomError } = require("./helpers")

const ACCOUNT_STARTING_BALANCE = 1_000_000_000_000_000n

describe("Marketplace constructor", function () {
  beforeEach(async function () {
    await snapshot()
    await ensureMinimumBlockHeight(256)
  })

  afterEach(async function () {
    await revert()
  })

  function testPercentageOverflow(property, expectedError) {
    it(`should reject for ${property} overflowing percentage values`, async () => {
      const config = exampleConfiguration()
      config.collateral[property] = 101

      const promise = ignition.deploy(MarketplaceModule, {
        parameters: {
          TestProxy: {
            configuration: config,
          },
        },
      })

      assertDeploymentRejectedWithCustomError(expectedError, promise)
    })
  }

  testPercentageOverflow(
    "repairRewardPercentage",
    "Marketplace_RepairRewardPercentageTooHigh",
  )
  testPercentageOverflow(
    "slashPercentage",
    "Marketplace_SlashPercentageTooHigh",
  )

  it("should reject when total slash percentage exceeds 100%", async () => {
    const config = exampleConfiguration()
    config.collateral.slashPercentage = 1
    config.collateral.maxNumberOfSlashes = 101

    const promise = ignition.deploy(MarketplaceModule, {
      parameters: {
        TestProxy: {
          configuration: config,
        },
      },
    })

    assertDeploymentRejectedWithCustomError(
      "Marketplace_MaximumSlashingTooHigh",
      promise,
    )
  })
})

// Currently, Hardhat Ignition does not track deployments in the Hardhat network,
// so when Hardhat runs tests on its network, Ignition will deploy new contracts
// every time it is deploying something. This prevents proper testing of the upgradability
// because a new Proxy will be deployed on the "upgrade deployment," and it won't reuse the
// original one.
// This can be tested manually by running `hardhat node` and then `hardhat test --network localhost`.
// But even then, the test "should share the same storage" is having issues, which I suspect
// are related to different network usage.
// Blocked until this issue is resolved: https://github.com/NomicFoundation/hardhat/issues/6927
describe.skip("Marketplace upgrades", function () {
  const config = exampleConfiguration()
  let originalMarketplace, proxy, token, request, client
  enableRequestAssertions()

  beforeEach(async function () {
    await snapshot()
    await ensureMinimumBlockHeight(256)
    const {
      marketplace,
      proxy: deployedProxy,
      token: token_,
    } = await ignition.deploy(MarketplaceModule, {
      deploymentId: "test",
      parameters: {
        TestProxy: {
          configuration: config,
        },
      },
    })

    proxy = deployedProxy
    originalMarketplace = marketplace
    token = token_

    await ensureMinimumBlockHeight(256)
    ;[client] = await ethers.getSigners()

    request = await exampleRequest()
    request.client = client.address

    token = token.connect(client)
    originalMarketplace = marketplace.connect(client)
  })

  afterEach(async function () {
    await revert()
  })

  it("should get upgraded", async () => {
    expect(() => originalMarketplace.newShinyMethod()).to.throw(TypeError)

    const { marketplace: upgradedMarketplace, proxy: upgradedProxy } =
      await ignition.deploy(MarketplaceUpgradeModule, {
        deploymentId: "test",
        parameters: {
          TestProxy: {
            configuration: config,
          },
        },
      })
    expect(await upgradedMarketplace.newShinyMethod()).to.equal(42)
    expect(await originalMarketplace.getAddress()).to.equal(
      await upgradedMarketplace.getAddress(),
    )
    expect(await originalMarketplace.configuration()).to.deep.equal(
      await upgradedMarketplace.configuration(),
    )
  })

  it("should share the same storage", async () => {
    // Old implementation not supporting the shiny method
    expect(() => originalMarketplace.newShinyMethod()).to.throw(TypeError)

    // We create a Request on the old implementation
    await token.approve(
      await originalMarketplace.getAddress(),
      maxPrice(request),
    )
    const now = await currentTime()
    await setNextBlockTimestamp(now)
    const expectedExpiry = now + request.expiry
    await expect(originalMarketplace.requestStorage(request))
      .to.emit(originalMarketplace, "StorageRequested")
      .withArgs(requestId(request), askToArray(request.ask), expectedExpiry)

    // Assert that the data is there
    expect(
      await originalMarketplace.getRequest(requestId(request)),
    ).to.be.request(request)

    // Upgrade Marketplace
    const { marketplace: upgradedMarketplace, token: _token } =
      await ignition.deploy(MarketplaceUpgradeModule)
    expect(await upgradedMarketplace.newShinyMethod()).to.equal(42)

    // Assert that the data is there
    expect(
      await upgradedMarketplace.getRequest(requestId(request)),
    ).to.be.request(request)
  })
})

describe("Marketplace", function () {
  const proof = exampleProof()
  const config = exampleConfiguration()

  let marketplace
  let token
  let client,
    clientWithdrawRecipient,
    host,
    host1,
    host2,
    host3,
    hostRewardRecipient,
    hostCollateralRecipient,
    validatorRecipient
  let request
  let slot

  enableRequestAssertions()

  beforeEach(async function () {
    await snapshot()

    await ensureMinimumBlockHeight(256)
    ;[
      client,
      clientWithdrawRecipient,
      host1,
      host2,
      host3,
      hostRewardRecipient,
      hostCollateralRecipient,
      validatorRecipient,
    ] = await ethers.getSigners()
    host = host1

    const { testMarketplace, token: _token } = await ignition.deploy(
      MarketplaceModule,
      {
        parameters: {
          TestProxy: {
            // TestMarketplace initialization is done in the TestProxy module
            configuration: config,
          },
        },
      },
    )

    marketplace = testMarketplace
    token = _token

    for (let account of [
      client,
      clientWithdrawRecipient,
      host1,
      host2,
      host3,
      hostRewardRecipient,
      hostCollateralRecipient,
      validatorRecipient,
    ]) {
      await token.mint(account.address, ACCOUNT_STARTING_BALANCE)
    }

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
      await token.approve(await marketplace.getAddress(), maxPrice(request))
      const now = await currentTime()
      await setNextBlockTimestamp(now)
      const expectedExpiry = now + request.expiry
      await expect(marketplace.requestStorage(request))
        .to.emit(marketplace, "StorageRequested")
        .withArgs(requestId(request), askToArray(request.ask), expectedExpiry)
    })

    it("allows retrieval of request details", async function () {
      await token.approve(await marketplace.getAddress(), maxPrice(request))
      await marketplace.requestStorage(request)
      const id = requestId(request)
      expect(await marketplace.getRequest(id)).to.be.request(request)
    })

    it("rejects request with invalid client address", async function () {
      let invalid = { ...request, client: host.address }
      await token.approve(await marketplace.getAddress(), maxPrice(invalid))
      await expect(
        marketplace.requestStorage(invalid),
      ).to.be.revertedWithCustomError(
        marketplace,
        "Marketplace_InvalidClientAddress",
      )
    })

    it("rejects request with duration exceeding limit", async function () {
      request.ask.duration = config.requestDurationLimit + 1
      await token.approve(
        await marketplace.getAddress(),
        collateralPerSlot(request),
      )
      await expect(
        marketplace.requestStorage(request),
      ).to.be.revertedWithCustomError(
        marketplace,
        "Marketplace_DurationExceedsLimit",
      )
    })

    it("rejects request with insufficient payment", async function () {
      let insufficient = maxPrice(request) - 1
      await token.approve(await marketplace.getAddress(), insufficient)
      await expect(
        marketplace.requestStorage(request),
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance")
    })

    it("rejects request when expiry out of bounds", async function () {
      await token.approve(await marketplace.getAddress(), maxPrice(request))

      request.expiry = request.ask.duration + 1
      await expect(
        marketplace.requestStorage(request),
      ).to.be.revertedWithCustomError(marketplace, "Marketplace_InvalidExpiry")

      request.expiry = 0
      await expect(
        marketplace.requestStorage(request),
      ).to.be.revertedWithCustomError(marketplace, "Marketplace_InvalidExpiry")
    })

    it("is rejected with insufficient slots ", async function () {
      request.ask.slots = 0
      await expect(
        marketplace.requestStorage(request),
      ).to.be.revertedWithCustomError(
        marketplace,
        "Marketplace_InsufficientSlots",
      )
    })

    it("is rejected when maxSlotLoss exceeds slots", async function () {
      request.ask.maxSlotLoss = request.ask.slots + 1
      await expect(
        marketplace.requestStorage(request),
      ).to.be.revertedWithCustomError(
        marketplace,
        "Marketplace_InvalidMaxSlotLoss",
      )
    })

    it("rejects resubmission of request", async function () {
      await token.approve(await marketplace.getAddress(), maxPrice(request) * 2)
      await marketplace.requestStorage(request)
      await expect(
        marketplace.requestStorage(request),
      ).to.be.revertedWithCustomError(
        marketplace,
        "Marketplace_RequestAlreadyExists",
      )
    })

    it("is rejected when insufficient duration", async function () {
      request.ask.duration = 0
      await expect(
        marketplace.requestStorage(request),
      ).to.be.revertedWithCustomError(
        marketplace,
        // request.expiry has to be > 0 and
        // request.expiry < request.ask.duration
        // so request.ask.duration will trigger "Marketplace_InvalidExpiry"
        "Marketplace_InvalidExpiry",
      )
    })

    it("is rejected when insufficient proofProbability", async function () {
      request.ask.proofProbability = 0
      await expect(
        marketplace.requestStorage(request),
      ).to.be.revertedWithCustomError(
        marketplace,
        "Marketplace_InsufficientProofProbability",
      )
    })

    it("is rejected when insufficient collateral", async function () {
      request.ask.collateralPerByte = 0
      await expect(
        marketplace.requestStorage(request),
      ).to.be.revertedWithCustomError(
        marketplace,
        "Marketplace_InsufficientCollateral",
      )
    })

    it("is rejected when insufficient reward", async function () {
      request.ask.pricePerBytePerSecond = 0
      await expect(
        marketplace.requestStorage(request),
      ).to.be.revertedWithCustomError(
        marketplace,
        "Marketplace_InsufficientReward",
      )
    })

    it("is rejected when cid is missing", async function () {
      request.content.cid = Buffer.from("")
      await expect(
        marketplace.requestStorage(request),
      ).to.be.revertedWithCustomError(marketplace, "Marketplace_InvalidCid")
    })
  })

  describe("filling a slot with collateral", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(await marketplace.getAddress(), maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(
        await marketplace.getAddress(),
        collateralPerSlot(request),
      )
    })

    it("emits event when slot is filled", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await expect(marketplace.fillSlot(slot.request, slot.index, proof))
        .to.emit(marketplace, "SlotFilled")
        .withArgs(slot.request, slot.index)
    })

    it("allows retrieval of host that filled slot", async function () {
      expect(await marketplace.getHost(slotId(slot))).to.equal(ZeroAddress)
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      expect(await marketplace.getHost(slotId(slot))).to.equal(
        await host.getAddress(),
      )
    })

    it("gives discount on the collateral for repaired slot", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.slotState(slotId(slot))).to.equal(
        SlotState.Repair,
      )

      // We need to advance the time to next period, because filling slot
      // must not be done in the same period as for that period there was already proof
      // submitted with the previous `fillSlot` and the transaction would revert with "Proof already submitted".
      await advanceTime(config.proofs.period + 1)

      const startBalance = await token.balanceOf(host.address)
      const collateral = collateralPerSlot(request)
      const discountedCollateral =
        collateral -
        Math.round(
          (collateral * config.collateral.repairRewardPercentage) / 100,
        )
      await token.approve(await marketplace.getAddress(), discountedCollateral)
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      const endBalance = await token.balanceOf(host.address)
      expect(startBalance - endBalance).to.equal(discountedCollateral)
      expect(await marketplace.slotState(slotId(slot))).to.equal(
        SlotState.Filled,
      )
    })

    it("fails to retrieve a request of an empty slot", async function () {
      expect(
        marketplace.getActiveSlot(slotId(slot)),
      ).to.be.revertedWithCustomError(marketplace, "Marketplace_SlotIsFree")
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
        marketplace.fillSlot(slot.request, slot.index, invalidProof()),
      ).to.be.revertedWithCustomError(marketplace, "Proofs_InvalidProof")
    })

    it("is rejected when slot already filled", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof),
      ).to.be.revertedWithCustomError(marketplace, "Marketplace_SlotNotFree")
    })

    it("is rejected when request is unknown", async function () {
      let unknown = await exampleRequest()
      await expect(
        marketplace.fillSlot(requestId(unknown), 0, proof),
      ).to.be.revertedWithCustomError(marketplace, "Marketplace_UnknownRequest")
    })

    it("is rejected when request is cancelled", async function () {
      switchAccount(client)
      let expired = { ...request, expiry: hours(1) + 1 }
      await token.approve(await marketplace.getAddress(), maxPrice(request))
      await marketplace.requestStorage(expired)
      await waitUntilCancelled(marketplace, expired)
      switchAccount(host)
      await marketplace.reserveSlot(requestId(expired), slot.index)
      await expect(
        marketplace.fillSlot(requestId(expired), slot.index, proof),
      ).to.be.revertedWithCustomError(marketplace, "Marketplace_SlotNotFree")
    })

    it("is rejected when request is finished", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, slot.request)
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof),
      ).to.be.revertedWithCustomError(marketplace, "Marketplace_SlotNotFree")
    })

    it("is rejected when request is failed", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFailed(marketplace, request)
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof),
      ).to.be.revertedWithCustomError(
        marketplace,
        "Marketplace_ReservationRequired",
      )
    })

    it("is rejected when slot index not in range", async function () {
      const invalid = request.ask.slots
      await expect(
        marketplace.fillSlot(slot.request, invalid, proof),
      ).to.be.revertedWithCustomError(marketplace, "Marketplace_InvalidSlot")
    })

    it("fails when all slots are already filled", async function () {
      const lastSlot = request.ask.slots - 1
      await token.approve(
        await marketplace.getAddress(),
        collateralPerSlot(request) * lastSlot,
      )
      await token.approve(
        await marketplace.getAddress(),
        maxPrice(request) * lastSlot,
      )
      for (let i = 0; i <= lastSlot; i++) {
        await marketplace.reserveSlot(slot.request, i)
        await marketplace.fillSlot(slot.request, i, proof)
      }
      await expect(
        marketplace.fillSlot(slot.request, lastSlot, proof),
      ).to.be.revertedWithCustomError(marketplace, "Marketplace_SlotNotFree")
    })

    it("fails if slot is not reserved first", async function () {
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof),
      ).to.be.revertedWithCustomError(
        marketplace,
        "Marketplace_ReservationRequired",
      )
    })
  })

  describe("filling slot without collateral", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(await marketplace.getAddress(), maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
    })

    it("is rejected when approved collateral is insufficient", async function () {
      let insufficient = collateralPerSlot(request) - 1
      await token.approve(await marketplace.getAddress(), insufficient)
      await marketplace.reserveSlot(slot.request, slot.index)
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof),
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance")
    })

    it("collects only requested collateral and not more", async function () {
      await token.approve(
        await marketplace.getAddress(),
        collateralPerSlot(request) * 2,
      )
      const startBalance = await token.balanceOf(host.address)
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      const endBalance = await token.balanceOf(host.address)
      expect(startBalance - endBalance).to.eq(collateralPerSlot(request))
    })
  })

  describe("submitting proofs when slot is filled", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(await marketplace.getAddress(), maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(await marketplace.getAddress(), collateral)
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
        marketplace.submitProof(slotId(slot), proof),
      ).to.be.revertedWithCustomError(
        marketplace,
        "Marketplace_ProofNotSubmittedByHost",
      )
    })

    it("converts first 31 bytes of challenge to field element", async function () {
      let challenge = getBytes(await marketplace.getChallenge(slotId(slot)))
      let truncated = challenge.slice(0, 31)
      let littleEndian = new Uint8Array(truncated).reverse()
      let expected = littleEndianToBigInt(littleEndian)
      expect(await marketplace.challengeToFieldElement(challenge)).to.equal(
        expected,
      )
    })

    it("converts merkle root to field element", async function () {
      let merkleRoot = request.content.merkleRoot
      let littleEndian = new Uint8Array(merkleRoot).reverse()
      let expected = littleEndianToBigInt(littleEndian)
      expect(await marketplace.merkleRootToFieldElement(merkleRoot)).to.equal(
        expected,
      )
    })
  })

  describe("request end", function () {
    var requestTime
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(await marketplace.getAddress(), maxPrice(request))
      await marketplace.requestStorage(request)
      requestTime = await currentTime()
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(await marketplace.getAddress(), collateral)
    })

    it("sets the request end time to now + duration", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      expect(await marketplace.requestEnd(requestId(request))).to.equal(
        requestTime + request.ask.duration,
      )
    })

    it("sets request end time to the past once failed", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFailed(marketplace, request)
      const now = await currentTime()
      expect(await marketplace.requestEnd(requestId(request))).to.be.eq(now - 1)
    })

    it("sets request end time to the past once cancelled", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(marketplace, request)
      const now = await currentTime()
      expect(await marketplace.requestEnd(requestId(request))).to.be.eq(now - 1)
    })

    it("checks that request end time is in the past once finished", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      const now = await currentTime()
      expect(await marketplace.requestEnd(requestId(request))).to.be.eq(now - 1)
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
      await token.approve(await marketplace.getAddress(), maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(await marketplace.getAddress(), collateral)
    })

    it("fails to free slot when slot not filled", async function () {
      slot.index = 5
      let nonExistentId = slotId(slot)
      await expect(
        marketplace.freeSlot(nonExistentId),
      ).to.be.revertedWithCustomError(marketplace, "Marketplace_SlotIsFree")
    })

    it("can only be freed by the host occupying the slot", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      switchAccount(client)
      await expect(marketplace.freeSlot(id)).to.be.revertedWithCustomError(
        marketplace,
        "Marketplace_InvalidSlotHost",
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
      await token.approve(await marketplace.getAddress(), collateral)
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
      await token.approve(await marketplace.getAddress(), collateral)
      await marketplace.fillSlot(slot.request, slot.index, proof)
    })
  })

  describe("paying out a slot", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(await marketplace.getAddress(), maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(await marketplace.getAddress(), collateral)
    })

    it("finished request pays out reward based on time hosted", async function () {
      // We are advancing the time because most of the slots will be filled somewhere
      // in the "expiry window" and not at its beginning. This is more "real" setup
      // and demonstrates the partial payout feature better.
      await advanceTime(request.expiry / 2)

      const expectedPayouts = await waitUntilStarted(
        marketplace,
        request,
        proof,
        token,
      )

      await waitUntilFinished(marketplace, requestId(request))

      const startBalanceHost = await token.balanceOf(host.address)
      await marketplace.freeSlot(slotId(slot))
      const endBalanceHost = await token.balanceOf(host.address)

      expect(expectedPayouts[slot.index]).to.be.lt(maxPrice(request))
      const collateral = collateralPerSlot(request)
      expect(endBalanceHost - startBalanceHost).to.equal(
        expectedPayouts[slot.index] + collateral,
      )
    })

    it("returns collateral to host collateral address if specified", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))

      const startBalanceHost = await token.balanceOf(host.address)
      const startBalanceCollateral = await token.balanceOf(
        hostCollateralRecipient.address,
      )

      const collateralToBeReturned = await marketplace.currentCollateral(
        slotId(slot),
      )

      await marketplace.freeSlot(
        slotId(slot),
        hostRewardRecipient.address,
        hostCollateralRecipient.address,
      )

      const endBalanceCollateral = await token.balanceOf(
        hostCollateralRecipient.address,
      )

      const endBalanceHost = await token.balanceOf(host.address)
      expect(endBalanceHost).to.equal(startBalanceHost)
      expect(endBalanceCollateral - startBalanceCollateral).to.equal(
        collateralPerSlot(request),
      )
      expect(collateralToBeReturned).to.equal(collateralPerSlot(request))
    })

    it("pays reward to host reward address if specified", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))

      const startBalanceHost = await token.balanceOf(host.address)
      const startBalanceReward = await token.balanceOf(
        hostRewardRecipient.address,
      )

      await marketplace.freeSlot(
        slotId(slot),
        hostRewardRecipient.address,
        hostCollateralRecipient.address,
      )

      const endBalanceHost = await token.balanceOf(host.address)
      const endBalanceReward = await token.balanceOf(
        hostRewardRecipient.address,
      )

      expect(endBalanceHost).to.equal(startBalanceHost)
      expect(endBalanceReward - startBalanceReward).to.gt(0)
    })

    it("pays the host when contract was cancelled", async function () {
      const startBalance = await token.balanceOf(host.address)

      // Lets advance the time more into the expiry window
      const filledAt = (await currentTime()) + Math.floor(request.expiry / 3)
      const expiresAt = await marketplace.requestExpiry(requestId(request))

      await marketplace.reserveSlot(slot.request, slot.index)
      await setNextBlockTimestamp(filledAt)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(marketplace, request)
      await marketplace.freeSlot(slotId(slot))

      const expectedPartialPayout = calculatePartialPayout(
        request,
        expiresAt,
        filledAt,
      )

      const endBalance = await token.balanceOf(host.address)

      expect(endBalance - startBalance).to.be.equal(expectedPartialPayout)
    })

    it("pays to host reward address when contract was cancelled, and returns collateral to host address", async function () {
      // Lets advance the time more into the expiry window
      const filledAt = (await currentTime()) + Math.floor(request.expiry / 3)
      const expiresAt = await marketplace.requestExpiry(requestId(request))

      await marketplace.reserveSlot(slot.request, slot.index)
      await setNextBlockTimestamp(filledAt)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(marketplace, request)
      const startBalanceHost = await token.balanceOf(host.address)
      const startBalanceReward = await token.balanceOf(
        hostRewardRecipient.address,
      )
      const startBalanceCollateral = await token.balanceOf(
        hostCollateralRecipient.address,
      )

      const collateralToBeReturned = await marketplace.currentCollateral(
        slotId(slot),
      )

      await marketplace.freeSlot(
        slotId(slot),
        hostRewardRecipient.address,
        hostCollateralRecipient.address,
      )

      const expectedPartialPayout = calculatePartialPayout(
        request,
        expiresAt,
        filledAt,
      )

      const endBalanceReward = await token.balanceOf(
        hostRewardRecipient.address,
      )
      expect(endBalanceReward - startBalanceReward).to.be.equal(
        expectedPartialPayout,
      )

      const endBalanceHost = await token.balanceOf(host.address)
      expect(endBalanceHost).to.be.equal(startBalanceHost)

      const endBalanceCollateral = await token.balanceOf(
        hostCollateralRecipient.address,
      )
      expect(endBalanceCollateral - startBalanceCollateral).to.be.equal(
        collateralPerSlot(request),
      )

      expect(collateralToBeReturned).to.be.equal(collateralPerSlot(request))
    })

    it("does not pay when the contract hasn't ended", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      const startBalanceHost = await token.balanceOf(host.address)
      const startBalanceReward = await token.balanceOf(
        hostRewardRecipient.address,
      )
      const startBalanceCollateral = await token.balanceOf(
        hostCollateralRecipient.address,
      )
      await marketplace.freeSlot(slotId(slot))
      const endBalanceHost = await token.balanceOf(host.address)
      const endBalanceReward = await token.balanceOf(
        hostRewardRecipient.address,
      )
      const endBalanceCollateral = await token.balanceOf(
        hostCollateralRecipient.address,
      )
      expect(endBalanceHost).to.equal(startBalanceHost)
      expect(endBalanceReward).to.equal(startBalanceReward)
      expect(endBalanceCollateral).to.equal(startBalanceCollateral)
    })

    it("can only be done once", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      await expect(
        marketplace.freeSlot(slotId(slot)),
      ).to.be.revertedWithCustomError(marketplace, "Marketplace_AlreadyPaid")
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
      await token.approve(await marketplace.getAddress(), maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(await marketplace.getAddress(), collateral)
    })

    it("emits event when all slots are filled", async function () {
      const lastSlot = request.ask.slots - 1
      await token.approve(
        await marketplace.getAddress(),
        collateralPerSlot(request) * lastSlot,
      )
      for (let i = 0; i < lastSlot; i++) {
        await marketplace.reserveSlot(slot.request, i)
        await marketplace.fillSlot(slot.request, i, proof)
      }

      const collateral = collateralPerSlot(request)
      await token.approve(await marketplace.getAddress(), collateral)
      await marketplace.reserveSlot(slot.request, lastSlot)
      await expect(marketplace.fillSlot(slot.request, lastSlot, proof))
        .to.emit(marketplace, "RequestFulfilled")
        .withArgs(requestId(request))
    })
    it("sets state when all slots are filled", async function () {
      const slots = request.ask.slots
      const collateral = collateralPerSlot(request)
      await token.approve(await marketplace.getAddress(), collateral * slots)
      for (let i = 0; i < slots; i++) {
        await marketplace.reserveSlot(slot.request, i)
        await marketplace.fillSlot(slot.request, i, proof)
      }
      expect(await marketplace.requestState(slot.request)).to.equal(
        RequestState.Started,
      )
    })
    it("fails when all slots are already filled", async function () {
      const lastSlot = request.ask.slots - 1
      await token.approve(
        await marketplace.getAddress(),
        collateralPerSlot(request) * (lastSlot + 1),
      )
      for (let i = 0; i <= lastSlot; i++) {
        await marketplace.reserveSlot(slot.request, i)
        await marketplace.fillSlot(slot.request, i, proof)
      }
      await expect(
        marketplace.fillSlot(slot.request, lastSlot, proof),
      ).to.be.revertedWithCustomError(marketplace, "Marketplace_SlotNotFree")
    })
  })

  describe("withdrawing funds", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(await marketplace.getAddress(), maxPrice(request))
      await marketplace.requestStorage(request)

      // wait a bit, so that there are funds for the client to withdraw
      await advanceTime(10)

      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(await marketplace.getAddress(), collateral)
    })

    it("rejects withdraw when request not yet timed out", async function () {
      switchAccount(client)
      await expect(
        marketplace.withdrawFunds(
          slot.request,
          clientWithdrawRecipient.address,
        ),
      ).to.be.revertedWithCustomError(marketplace, "Marketplace_InvalidState")
    })

    it("rejects withdraw when wrong account used", async function () {
      await waitUntilCancelled(marketplace, request)
      await expect(
        marketplace.withdrawFunds(
          slot.request,
          clientWithdrawRecipient.address,
        ),
      ).to.be.revertedWithCustomError(
        marketplace,
        "Marketplace_InvalidClientAddress",
      )
    })

    it("rejects withdraw when in wrong state", async function () {
      // fill all slots, should change state to RequestState.Started
      const lastSlot = request.ask.slots - 1
      await token.approve(
        await marketplace.getAddress(),
        collateralPerSlot(request) * (lastSlot + 1),
      )
      for (let i = 0; i <= lastSlot; i++) {
        await marketplace.reserveSlot(slot.request, i)
        await marketplace.fillSlot(slot.request, i, proof)
      }
      await waitUntilCancelled(marketplace, request)
      switchAccount(client)
      await expect(
        marketplace.withdrawFunds(
          slot.request,
          clientWithdrawRecipient.address,
        ),
      ).to.be.revertedWithCustomError(marketplace, "Marketplace_InvalidState")
    })

    it("rejects withdraw when already withdrawn", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))

      switchAccount(client)
      await marketplace.withdrawFunds(
        slot.request,
        clientWithdrawRecipient.address,
      )
      await expect(
        marketplace.withdrawFunds(
          slot.request,
          clientWithdrawRecipient.address,
        ),
      ).to.be.revertedWithCustomError(
        marketplace,
        "Marketplace_NothingToWithdraw",
      )
    })

    it("emits event once request is cancelled", async function () {
      await waitUntilCancelled(marketplace, request)
      switchAccount(client)
      await expect(
        marketplace.withdrawFunds(
          slot.request,
          clientWithdrawRecipient.address,
        ),
      )
        .to.emit(marketplace, "RequestCancelled")
        .withArgs(requestId(request))
    })

    it("withdraw rest of funds to the client payout address for finished requests", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))

      switchAccount(client)
      const startBalanceClient = await token.balanceOf(client.address)
      const startBalancePayout = await token.balanceOf(
        clientWithdrawRecipient.address,
      )
      await marketplace.withdrawFunds(
        slot.request,
        clientWithdrawRecipient.address,
      )

      const endBalanceClient = await token.balanceOf(client.address)
      const endBalancePayout = await token.balanceOf(
        clientWithdrawRecipient.address,
      )

      expect(endBalanceClient).to.equal(startBalanceClient)
      // As all the request's slots will get filled and request will start and successfully finishes,
      // then the upper bound to how much the client gets returned is the cumulative reward for all the
      // slots for expiry window. This limit is "inclusive" because it is possible that all slots are filled
      // at the time of expiry and hence the user would get the full "expiry window" reward back.
      expect(endBalancePayout - startBalancePayout).to.be.gt(0)
      expect(endBalancePayout - startBalancePayout).to.be.lte(
        request.expiry * pricePerSlotPerSecond(request),
      )
    })

    it("withdraws to the client payout address when request is cancelled", async function () {
      await waitUntilCancelled(marketplace, request)
      switchAccount(client)
      const startBalanceClient = await token.balanceOf(client.address)
      const startBalancePayout = await token.balanceOf(
        clientWithdrawRecipient.address,
      )
      await marketplace.withdrawFunds(
        slot.request,
        clientWithdrawRecipient.address,
      )
      const endBalanceClient = await token.balanceOf(client.address)
      const endBalancePayout = await token.balanceOf(
        clientWithdrawRecipient.address,
      )
      expect(endBalanceClient).to.equal(startBalanceClient)
      expect(endBalancePayout - startBalancePayout).to.equal(maxPrice(request))
    })

    it("withdraws full price for failed requests to the client payout address", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFailed(marketplace, request)

      switchAccount(client)

      const startBalanceClient = await token.balanceOf(client.address)
      const startBalancePayout = await token.balanceOf(
        clientWithdrawRecipient.address,
      )
      await marketplace.withdrawFunds(
        slot.request,
        clientWithdrawRecipient.address,
      )

      const endBalanceClient = await token.balanceOf(client.address)
      const endBalancePayout = await token.balanceOf(
        clientWithdrawRecipient.address,
      )

      expect(endBalanceClient).to.equal(startBalanceClient)
      expect(endBalancePayout - startBalancePayout).to.equal(maxPrice(request))
    })

    it("withdraws to the client payout address for cancelled requests lowered by hosts payout", async function () {
      const startBalance = await token.balanceOf(host.address)

      // Lets advance the time more into the expiry window
      const filledAt = (await currentTime()) + Math.floor(request.expiry / 3)
      const expiresAt = await marketplace.requestExpiry(requestId(request))

      await marketplace.reserveSlot(slot.request, slot.index)
      await setNextBlockTimestamp(filledAt)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(marketplace, request)

      const expectedPartialhostRewardRecipient = calculatePartialPayout(
        request,
        expiresAt,
        filledAt,
      )

      switchAccount(client)
      await marketplace.withdrawFunds(
        slot.request,
        clientWithdrawRecipient.address,
      )
      const endBalance = await token.balanceOf(clientWithdrawRecipient.address)
      expect(endBalance - startBalance).to.equal(
        maxPrice(request) - expectedPartialhostRewardRecipient,
      )
    })

    it("when slot is freed and not repaired, client will get refunded the freed slot's funds", async function () {
      const startBalance = await token.balanceOf(host.address)
      const payouts = await waitUntilStarted(marketplace, request, proof, token)

      await expect(marketplace.freeSlot(slotId(slot))).to.emit(
        marketplace,
        "SlotFreed",
      )
      await waitUntilFinished(marketplace, requestId(request))

      switchAccount(client)
      await marketplace.withdrawFunds(
        slot.request,
        clientWithdrawRecipient.address,
      )
      const endBalance = await token.balanceOf(clientWithdrawRecipient.address)
      expect(endBalance - startBalance).to.equal(
        maxPrice(request) -
          payouts.reduce((a, b) => a + b, 0) + // This is the amount that user gets refunded for filling period in expiry window
          payouts[slot.index], // This is the refunded amount for the freed slot
      )
    })
  })

  describe("request state", function () {
    const { New, Cancelled, Started, Failed, Finished } = RequestState

    beforeEach(async function () {
      switchAccount(client)
      await token.approve(await marketplace.getAddress(), maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(await marketplace.getAddress(), collateral)
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
      await marketplace.withdrawFunds(
        slot.request,
        clientWithdrawRecipient.address,
      )
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
        await marketplace.getAddress(),
        collateralPerSlot(request) * (request.ask.maxSlotLoss + 1),
      )
      for (let i = 0; i <= request.ask.maxSlotLoss; i++) {
        await marketplace.reserveSlot(slot.request, i)
        await marketplace.fillSlot(slot.request, i, proof)
      }
      for (let i = 0; i <= request.ask.maxSlotLoss; i++) {
        slot.index = i
        let id = slotId(slot)
        await marketplace.forciblyFreeSlot(id)
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
    const { Free, Filled, Finished, Failed, Paid, Cancelled, Repair } =
      SlotState
    let period, periodEnd

    beforeEach(async function () {
      period = config.proofs.period
      ;({ periodOf, periodEnd } = periodic(period))

      switchAccount(client)
      await token.approve(await marketplace.getAddress(), maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(await marketplace.getAddress(), collateral)
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

    it("changes to 'Paid' when host has been paid", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, slot.request)
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.slotState(slotId(slot))).to.equal(Paid)
    })
  })

  describe("slot probability", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(await marketplace.getAddress(), maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(await marketplace.getAddress(), collateral)
    })

    it("calculates correctly the slot probability", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)

      // request.ask.proofProbability  = 4
      // config.proofs.downtime = 64
      // 4 * (256 - 64) / 256
      const expectedProbability = 3
      expect(await marketplace.slotProbability(slotId(slot))).to.equal(
        expectedProbability,
      )
    })
  })

  describe("proof requirements", function () {
    let period, periodOf, periodEnd

    beforeEach(async function () {
      period = config.proofs.period
      ;({ periodOf, periodEnd } = periodic(period))

      switchAccount(client)
      await token.approve(await marketplace.getAddress(), maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(await marketplace.getAddress(), collateral)
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
      expect(await marketplace.willProofBeRequired(id)).to.be.true
      await waitUntilCancelled(marketplace, request)
      expect(await marketplace.willProofBeRequired(id)).to.be.false
    })

    it("does not require proofs once cancelled", async function () {
      const id = slotId(slot)
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilProofIsRequired(id)
      expect(await marketplace.isProofRequired(id)).to.be.true
      await waitUntilCancelled(marketplace, request)
      expect(await marketplace.isProofRequired(id)).to.be.false
    })

    it("does not provide challenges once cancelled", async function () {
      const id = slotId(slot)
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilProofIsRequired(id)
      const challenge1 = await marketplace.getChallenge(id)
      expect(challenge1 > 0)
      await waitUntilCancelled(marketplace, request)
      const challenge2 = await marketplace.getChallenge(id)
      expect(challenge2 == 0)
    })

    it("does not provide pointer once cancelled", async function () {
      const id = slotId(slot)
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilProofIsRequired(id)
      const challenge1 = await marketplace.getChallenge(id)
      expect(challenge1 > 0)
      await waitUntilCancelled(marketplace, request)
      const challenge2 = await marketplace.getChallenge(id)
      expect(challenge2 == 0)
    })
  })

  describe("missing proofs", function () {
    let period, periodOf, periodEnd

    beforeEach(async function () {
      period = config.proofs.period
      ;({ periodOf, periodEnd } = periodic(period))

      switchAccount(client)
      await token.approve(await marketplace.getAddress(), maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(await marketplace.getAddress(), collateral)
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
        marketplace.markProofAsMissing(slotId(slot), missedPeriod),
      ).to.be.revertedWithCustomError(
        marketplace,
        "Marketplace_SlotNotAcceptingProofs",
      )
    })

    describe("slashing when missing proofs", function () {
      it("reduces collateral when a proof is missing", async function () {
        const id = slotId(slot)
        const { slashPercentage } = config.collateral
        await marketplace.reserveSlot(slot.request, slot.index)
        await marketplace.fillSlot(slot.request, slot.index, proof)

        await waitUntilProofIsRequired(id)
        let missedPeriod = periodOf(await currentTime())
        await advanceTime(period + 1)
        await marketplace.markProofAsMissing(id, missedPeriod)

        const collateral = collateralPerSlot(request)
        const expectedBalance = Math.round(
          (collateral * (100 - slashPercentage)) / 100,
        )

        expect(expectedBalance == (await marketplace.getSlotCollateral(id)))
      })

      it("rewards validator when marking proof as missing", async function () {
        const id = slotId(slot)
        const { slashPercentage, validatorRewardPercentage } = config.collateral
        await marketplace.reserveSlot(slot.request, slot.index)
        await marketplace.fillSlot(slot.request, slot.index, proof)

        switchAccount(validatorRecipient)

        const startBalance = await token.balanceOf(validatorRecipient.address)

        await waitUntilProofIsRequired(id)
        let missedPeriod = periodOf(await currentTime())
        await advanceTime(period + 1)
        await marketplace.markProofAsMissing(id, missedPeriod)

        const endBalance = await token.balanceOf(validatorRecipient.address)

        const collateral = collateralPerSlot(request)
        const slashedAmount = (collateral * slashPercentage) / 100

        const expectedReward = Math.round(
          (slashedAmount * validatorRewardPercentage) / 100,
        )

        expect(endBalance).to.equal(
          calculateBalance(startBalance, expectedReward),
        )
      })
    })

    it("frees slot when collateral slashed below minimum threshold", async function () {
      const collateral = collateralPerSlot(request)
      const minimum =
        collateral -
        (collateral *
          config.collateral.maxNumberOfSlashes *
          config.collateral.slashPercentage) /
          100
      await waitUntilStarted(marketplace, request, proof, token)
      while ((await marketplace.slotState(slotId(slot))) === SlotState.Filled) {
        expect(await marketplace.getSlotCollateral(slotId(slot))).to.be.gt(
          minimum,
        )
        await waitUntilProofIsRequired(slotId(slot))
        const missedPeriod = periodOf(await currentTime())
        await advanceTime(period + 1)
        await marketplace.markProofAsMissing(slotId(slot), missedPeriod)
      }
      expect(await marketplace.slotState(slotId(slot))).to.equal(
        SlotState.Repair,
      )
      expect(await marketplace.getSlotCollateral(slotId(slot))).to.be.lte(
        minimum,
      )
    })

    it("free slot when minimum reached and resets missed proof counter", async function () {
      const collateral = collateralPerSlot(request)
      const minimum =
        collateral -
        (collateral *
          config.collateral.maxNumberOfSlashes *
          config.collateral.slashPercentage) /
          100
      await waitUntilStarted(marketplace, request, proof, token)
      let missedProofs = 0
      while ((await marketplace.slotState(slotId(slot))) === SlotState.Filled) {
        expect(await marketplace.getSlotCollateral(slotId(slot))).to.be.gt(
          minimum,
        )
        await waitUntilProofIsRequired(slotId(slot))
        const missedPeriod = periodOf(await currentTime())
        await advanceTime(period + 1)
        expect(await marketplace.missingProofs(slotId(slot))).to.equal(
          missedProofs,
        )
        await marketplace.markProofAsMissing(slotId(slot), missedPeriod)
        missedProofs += 1
      }
      expect(await marketplace.slotState(slotId(slot))).to.equal(
        SlotState.Repair,
      )
      expect(await marketplace.missingProofs(slotId(slot))).to.equal(0)
      expect(await marketplace.getSlotCollateral(slotId(slot))).to.be.lte(
        minimum,
      )
    })
  })

  describe("list of active requests", function () {
    beforeEach(async function () {
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(await marketplace.getAddress(), collateral)
      switchAccount(client)
      await token.approve(await marketplace.getAddress(), maxPrice(request))
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
      await marketplace.withdrawFunds(
        requestId(request),
        clientWithdrawRecipient.address,
      )
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

    it("removes request from list when request finishes", async function () {
      await marketplace.requestStorage(request)
      switchAccount(host)
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      switchAccount(client)
      expect(await marketplace.myRequests()).to.deep.equal([])
    })
  })

  describe("list of active slots", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(await marketplace.getAddress(), maxPrice(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      const collateral = collateralPerSlot(request)
      await token.approve(await marketplace.getAddress(), collateral)
    })

    it("adds slot to list when filling slot", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      let slot1 = { ...slot, index: slot.index + 1 }
      const collateral = collateralPerSlot(request)
      await token.approve(await marketplace.getAddress(), collateral)
      await marketplace.reserveSlot(slot.request, slot1.index)
      await marketplace.fillSlot(slot.request, slot1.index, proof)
      const slots = Array.from(await marketplace.mySlots())
      expect(slots).to.have.members([slotId(slot), slotId(slot1)])
    })

    it("removes slot from list when slot is freed", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      let slot1 = { ...slot, index: slot.index + 1 }
      const collateral = collateralPerSlot(request)
      await token.approve(await marketplace.getAddress(), collateral)
      await marketplace.reserveSlot(slot.request, slot1.index)
      await marketplace.fillSlot(slot.request, slot1.index, proof)
      await token.approve(await marketplace.getAddress(), collateral)
      await marketplace.freeSlot(slotId(slot))
      const slots = Array.from(await marketplace.mySlots())
      expect(slots).to.have.members([slotId(slot1)])
    })

    it("keeps slots when cancelled", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      let slot1 = { ...slot, index: slot.index + 1 }

      const collateral = collateralPerSlot(request)
      await token.approve(await marketplace.getAddress(), collateral)
      await marketplace.reserveSlot(slot.request, slot1.index)
      await marketplace.fillSlot(slot.request, slot1.index, proof)
      await waitUntilCancelled(marketplace, request)
      const slots = Array.from(await marketplace.mySlots())
      expect(slots).to.have.members([slotId(slot), slotId(slot1)])
    })

    it("removes slot when finished slot is freed", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      const slots = Array.from(await marketplace.mySlots())
      expect(slots).to.not.contain(slotId(slot))
    })

    it("removes slot when cancelled slot is freed", async function () {
      await marketplace.reserveSlot(slot.request, slot.index)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(marketplace, request)
      await marketplace.freeSlot(slotId(slot))
      const slots = Array.from(await marketplace.mySlots())
      expect(slots).to.not.contain(slotId(slot))
    })

    it("removes slot when failed slot is freed", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilSlotFailed(marketplace, request, slot)
      await marketplace.freeSlot(slotId(slot))
      const slots = Array.from(await marketplace.mySlots())
      expect(slots).to.not.contain(slotId(slot))
    })
  })
})
