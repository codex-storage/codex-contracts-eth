const { expect } = require("chai")
const { ethers, deployments } = require("hardhat")
const { exampleRequest, exampleOffer } = require("./examples")
const { mineBlock, minedBlockNumber } = require("./mining")
const { requestId, offerId } = require("./ids")

describe("Storage", function () {
  let storage
  let token
  let client, host
  let request, offer
  let collateralAmount, slashMisses, slashPercentage
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

    offer = exampleOffer()
    offer.host = host.address
    offer.requestId = requestId(request)

    switchAccount(client)
    await token.approve(storage.address, request.maxPrice)
    await storage.requestStorage(request)
    switchAccount(host)
    await token.approve(storage.address, collateralAmount)
    await storage.deposit(collateralAmount)
    await storage.offerStorage(offer)
    switchAccount(client)
    await storage.selectOffer(offerId(offer))
    id = offerId(offer)
  })

  describe("starting the contract", function () {
    it("starts requiring storage proofs", async function () {
      switchAccount(host)
      await storage.startContract(id)
      expect(await storage.proofEnd(id)).to.be.gt(0)
    })

    it("can only be done by the host", async function () {
      switchAccount(client)
      await expect(storage.startContract(id)).to.be.revertedWith(
        "Only host can call this function"
      )
    })

    it("can only be done once", async function () {
      switchAccount(host)
      await storage.startContract(id)
      await expect(storage.startContract(id)).to.be.reverted
    })
  })

  describe("finishing the contract", function () {
    beforeEach(async function () {
      switchAccount(host)
      await storage.startContract(id)
    })

    async function mineUntilEnd() {
      const end = await storage.proofEnd(id)
      while ((await minedBlockNumber()) < end) {
        await mineBlock()
      }
    }

    // it("unlocks the host collateral", async function () {
    //   await mineUntilEnd()
    //   await storage.finishContract(id)
    //   await expect(storage.withdraw()).not.to.be.reverted
    // })

    it("pays the host", async function () {
      await mineUntilEnd()
      const startBalance = await token.balanceOf(host.address)
      await storage.finishContract(id)
      const endBalance = await token.balanceOf(host.address)
      expect(endBalance - startBalance).to.equal(offer.price)
    })

    it("is only allowed when end time has passed", async function () {
      await expect(storage.finishContract(id)).to.be.revertedWith(
        "Contract has not ended yet"
      )
    })

    it("can only be done once", async function () {
      await mineUntilEnd()
      await storage.finishContract(id)
      await expect(storage.finishContract(id)).to.be.revertedWith(
        "Contract already finished"
      )
    })
  })

  describe("slashing when missing proofs", function () {
    beforeEach(function () {
      switchAccount(host)
    })

    async function ensureProofIsMissing() {
      while (!(await storage.isProofRequired(id, await minedBlockNumber()))) {
        mineBlock()
      }
      const blocknumber = await minedBlockNumber()
      for (let i = 0; i < request.proofTimeout; i++) {
        mineBlock()
      }
      await storage.markProofAsMissing(id, blocknumber)
    }

    it("reduces collateral when too many proofs are missing", async function () {
      await storage.connect(host).startContract(id)
      for (let i = 0; i < slashMisses; i++) {
        await ensureProofIsMissing()
      }
      const expectedBalance = (collateralAmount * (100 - slashPercentage)) / 100
      expect(await storage.balanceOf(host.address)).to.equal(expectedBalance)
    })
  })
})

// TODO: failure to start contract burns host and client
// TODO: implement checking of actual proofs of storage, instead of dummy bool
// TODO: allow other host to take over contract when too many missed proofs
// TODO: small partial payouts when proofs are being submitted
// TODO: reward caller of markProofAsMissing
