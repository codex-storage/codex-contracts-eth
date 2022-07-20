const { expect } = require("chai")
const { ethers, deployments } = require("hardhat")
const { hexlify, randomBytes } = ethers.utils
const { AddressZero } = ethers.constants
const { exampleRequest } = require("./examples")
const { advanceTime, advanceTimeTo, currentTime } = require("./evm")
const { requestId, slotId } = require("./ids")
const { periodic } = require("./time")

describe("Storage", function () {
  const proof = hexlify(randomBytes(42))

  let storage
  let token
  let client, host
  let request
  let collateralAmount, slashMisses, slashPercentage
  let slot
  let id

  function switchAccount(account) {
    token = token.connect(account)
    storage = storage.connect(account)
  }

  beforeEach(async function () {
    ;[client, host] = await ethers.getSigners()

    await deployments.fixture(["TestToken", "Storage"])
    token = await ethers.getContract("TestToken")
    storage = await ethers.getContract("Storage")

    await token.mint(client.address, 1000)
    await token.mint(host.address, 1000)

    collateralAmount = await storage.collateralAmount()
    slashMisses = await storage.slashMisses()
    slashPercentage = await storage.slashPercentage()

    request = exampleRequest()
    request.client = client.address
    id = requestId(request)
    slot = {
      request: requestId(request),
      index: request.content.erasure.totalNodes / 2,
    }

    switchAccount(client)
    await token.approve(storage.address, request.ask.reward)
    await storage.requestStorage(request)
    switchAccount(host)
    await token.approve(storage.address, collateralAmount)
    await storage.deposit(collateralAmount)
  })

  it("can retrieve storage requests", async function () {
    const id = requestId(request)
    const retrieved = await storage.getRequest(id)
    expect(retrieved.client).to.equal(request.client)
    expect(retrieved.expiry).to.equal(request.expiry)
    expect(retrieved.nonce).to.equal(request.nonce)
  })

  it("can retrieve host that fulfilled request", async function () {
    expect(await storage.getHost(requestId(request))).to.equal(AddressZero)
    await storage.fulfillRequest(requestId(request), proof)
    expect(await storage.getHost(requestId(request))).to.equal(host.address)
  })

  describe("ending the contract", function () {
    async function waitUntilEnd() {
      const end = (await storage.proofEnd(slotId(slot))).toNumber()
      await advanceTimeTo(end)
    }

    it("unlocks the host collateral", async function () {
      await storage.fillSlot(slot.request, slot.index, proof)
      await waitUntilEnd()
      await expect(storage.withdraw()).not.to.be.reverted
    })
  })

  describe("slashing when missing proofs", function () {
    let period, periodOf, periodEnd

    beforeEach(async function () {
      period = (await storage.proofPeriod()).toNumber()
      ;({ periodOf, periodEnd } = periodic(period))
    })

    async function waitUntilProofIsRequired() {
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

    it("reduces collateral when too many proofs are missing", async function () {
      await storage.fulfillRequest(requestId(request), proof)
      for (let i = 0; i < slashMisses; i++) {
        await waitUntilProofIsRequired()
        let missedPeriod = periodOf(await currentTime())
        await advanceTime(period)
        await storage.markProofAsMissing(id, missedPeriod)
      }
      const expectedBalance = (collateralAmount * (100 - slashPercentage)) / 100
      expect(await storage.balanceOf(host.address)).to.equal(expectedBalance)
    })
  })
})

// TODO: implement checking of actual proofs of storage, instead of dummy bool
// TODO: allow other host to take over contract when too many missed proofs
// TODO: small partial payouts when proofs are being submitted
// TODO: reward caller of markProofAsMissing
