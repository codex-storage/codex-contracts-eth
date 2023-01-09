const { expect } = require("chai")
const { ethers, deployments } = require("hardhat")
const { hexlify, randomBytes } = ethers.utils
const { AddressZero } = ethers.constants
const { exampleRequest } = require("./examples")
const { advanceTime, advanceTimeTo, currentTime } = require("./evm")
const { requestId, slotId } = require("./ids")
const { periodic } = require("./time")
const { price } = require("./price")
const {
  waitUntilCancelled,
  waitUntilStarted,
  waitUntilFinished,
} = require("./marketplace")

describe("Storage", function () {
  const proof = hexlify(randomBytes(42))

  let storage
  let token
  let client, host
  let request
  let collateralAmount, slashMisses, slashPercentage
  let slot

  function switchAccount(account) {
    token = token.connect(account)
    storage = storage.connect(account)
  }

  beforeEach(async function () {
    ;[client, host] = await ethers.getSigners()

    await deployments.fixture(["TestToken", "Storage"])
    token = await ethers.getContract("TestToken")
    storage = await ethers.getContract("Storage")

    await token.mint(client.address, 1_000_000_000)
    await token.mint(host.address, 1_000_000_000)

    collateralAmount = await storage.collateralAmount()
    slashMisses = await storage.slashMisses()
    slashPercentage = await storage.slashPercentage()
    minCollateralThreshold = await storage.minCollateralThreshold()

    request = await exampleRequest()
    request.client = client.address
    slot = {
      request: requestId(request),
      index: request.ask.slots / 2,
    }

    switchAccount(client)
    await token.approve(storage.address, price(request))
    await storage.requestStorage(request)
    switchAccount(host)
    await token.approve(storage.address, collateralAmount)
    await storage.deposit(collateralAmount)
  })

  describe("ending the contract", function () {
    it("unlocks the host collateral", async function () {
      await storage.fillSlot(slot.request, slot.index, proof)
      await waitUntilFinished(storage, slot.request)
      await storage.freeSlot(slotId(slot))
      await expect(storage.withdraw()).not.to.be.reverted
    })
  })

  describe("missing proofs", function () {
    let period, periodOf, periodEnd

    beforeEach(async function () {
      period = (await storage.proofPeriod()).toNumber()
      ;({ periodOf, periodEnd } = periodic(period))
    })

    async function waitUntilProofIsRequired(id) {
      await advanceTimeTo(periodEnd(periodOf(await currentTime())))
      while (
        !(
          (await storage.isProofRequired(id)) &&
          (await storage.getPointer(id)) < 250
        )
      ) {
        await advanceTime(period)
      }
    }

    it("fails to mark proof as missing when cancelled", async function () {
      await storage.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(request)
      let missedPeriod = periodOf(await currentTime())
      await expect(
        storage.markProofAsMissing(slotId(slot), missedPeriod)
      ).to.be.revertedWith("Slot not accepting proofs")
    })

    describe("slashing when missing proofs", function () {
      it("reduces collateral when too many proofs are missing", async function () {
        const id = slotId(slot)
        await storage.fillSlot(slot.request, slot.index, proof)
        for (let i = 0; i < slashMisses; i++) {
          await waitUntilProofIsRequired(id)
          let missedPeriod = periodOf(await currentTime())
          await advanceTime(period)
          await storage.markProofAsMissing(id, missedPeriod)
        }
        const expectedBalance =
          (collateralAmount * (100 - slashPercentage)) / 100
        expect(await storage.balanceOf(host.address)).to.equal(expectedBalance)
      })
    })

    describe("freeing a slot", function () {
      it("frees slot when collateral slashed below minimum threshold", async function () {
        const id = slotId(slot)

        await waitUntilStarted(storage, request, proof)

        // max slashes before dropping below collateral threshold
        const maxSlashes = 10
        for (let i = 0; i < maxSlashes; i++) {
          for (let j = 0; j < slashMisses; j++) {
            await waitUntilProofIsRequired(id)
            let missedPeriod = periodOf(await currentTime())
            await advanceTime(period)
            if (i === maxSlashes - 1 && j === slashMisses - 1) {
              await expect(
                await storage.markProofAsMissing(id, missedPeriod)
              ).to.emit(storage, "SlotFreed")
              expect(await storage.getHost(id)).to.equal(AddressZero)
            } else {
              await storage.markProofAsMissing(id, missedPeriod)
            }
          }
        }
      })
    })
  })
})

// TODO: implement checking of actual proofs of storage, instead of dummy bool
// TODO: allow other host to take over contract when too many missed proofs
// TODO: small partial payouts when proofs are being submitted
// TODO: reward caller of markProofAsMissing
