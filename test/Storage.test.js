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

    collateralAmount = await storage.collateral()
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
})

// TODO: implement checking of actual proofs of storage, instead of dummy bool
// TODO: allow other host to take over contract when too many missed proofs
// TODO: small partial payouts when proofs are being submitted
// TODO: reward caller of markProofAsMissing
