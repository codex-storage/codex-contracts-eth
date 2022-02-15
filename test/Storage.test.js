const { expect } = require("chai")
const { ethers, deployments } = require("hardhat")
const { hashRequest, hashBid, sign } = require("./marketplace")
const { exampleRequest, exampleBid } = require("./examples")
const { mineBlock, minedBlockNumber } = require("./mining")

describe("Storage", function () {
  const request = exampleRequest()
  const bid = exampleBid()

  let storage
  let token
  let client, host
  let collateralAmount, slashMisses, slashPercentage

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
  })

  describe("creating a new storage contract", function () {
    let id

    beforeEach(async function () {
      await token.connect(host).approve(storage.address, collateralAmount)
      await token.connect(client).approve(storage.address, bid.price)
      await storage.connect(host).deposit(collateralAmount)
      let requestHash = hashRequest(request)
      let bidHash = hashBid({ ...bid, requestHash })
      await storage.newContract(
        request.duration,
        request.size,
        request.contentHash,
        request.proofPeriod,
        request.proofTimeout,
        request.nonce,
        bid.price,
        await host.getAddress(),
        bid.bidExpiry,
        await sign(client, requestHash),
        await sign(host, bidHash)
      )
      id = bidHash
    })

    it("created the contract", async function () {
      expect(await storage.duration(id)).to.equal(request.duration)
      expect(await storage.size(id)).to.equal(request.size)
      expect(await storage.contentHash(id)).to.equal(request.contentHash)
      expect(await storage.proofPeriod(id)).to.equal(request.proofPeriod)
      expect(await storage.proofTimeout(id)).to.equal(request.proofTimeout)
      expect(await storage.price(id)).to.equal(bid.price)
      expect(await storage.host(id)).to.equal(await host.getAddress())
    })

    it("locks up host collateral", async function () {
      await expect(storage.connect(host).withdraw()).to.be.revertedWith(
        "Account locked"
      )
    })

    describe("starting the contract", function () {
      it("starts requiring storage proofs", async function () {
        await storage.connect(host).startContract(id)
        expect(await storage.proofEnd(id)).to.be.gt(0)
      })

      it("can only be done by the host", async function () {
        await expect(
          storage.connect(client).startContract(id)
        ).to.be.revertedWith("Only host can call this function")
      })

      it("can only be done once", async function () {
        await storage.connect(host).startContract(id)
        await expect(storage.connect(host).startContract(id)).to.be.reverted
      })
    })

    describe("finishing the contract", function () {
      beforeEach(async function () {
        await storage.connect(host).startContract(id)
      })

      async function mineUntilEnd() {
        const end = await storage.proofEnd(id)
        while ((await minedBlockNumber()) < end) {
          await mineBlock()
        }
      }

      it("unlocks the host collateral", async function () {
        await mineUntilEnd()
        await storage.finishContract(id)
        await expect(storage.connect(host).withdraw()).not.to.be.reverted
      })

      it("pays the host", async function () {
        await mineUntilEnd()
        const startBalance = await token.balanceOf(host.address)
        await storage.finishContract(id)
        const endBalance = await token.balanceOf(host.address)
        expect(endBalance - startBalance).to.equal(bid.price)
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
        const expectedBalance =
          (collateralAmount * (100 - slashPercentage)) / 100
        expect(await storage.balanceOf(host.address)).to.equal(expectedBalance)
      })
    })
  })

  it("doesn't create contract with insufficient collateral", async function () {
    await token.connect(host).approve(storage.address, collateralAmount - 1)
    await token.connect(client).approve(storage.address, bid.price)
    await storage.connect(host).deposit(collateralAmount - 1)
    let requestHash = hashRequest(request)
    let bidHash = hashBid({ ...bid, requestHash })
    await expect(
      storage.newContract(
        request.duration,
        request.size,
        request.contentHash,
        request.proofPeriod,
        request.proofTimeout,
        request.nonce,
        bid.price,
        await host.getAddress(),
        bid.bidExpiry,
        await sign(client, requestHash),
        await sign(host, bidHash)
      )
    ).to.be.revertedWith("Insufficient collateral")
  })

  it("doesn't create contract without payment of price", async function () {
    await token.connect(host).approve(storage.address, collateralAmount)
    await token.connect(client).approve(storage.address, bid.price - 1)
    await storage.connect(host).deposit(collateralAmount)
    let requestHash = hashRequest(request)
    let bidHash = hashBid({ ...bid, requestHash })
    await expect(
      storage.newContract(
        request.duration,
        request.size,
        request.contentHash,
        request.proofPeriod,
        request.proofTimeout,
        request.nonce,
        bid.price,
        await host.getAddress(),
        bid.bidExpiry,
        await sign(client, requestHash),
        await sign(host, bidHash)
      )
    ).to.be.revertedWith("ERC20: transfer amount exceeds allowance")
  })
})

// TODO: failure to start contract burns host and client
// TODO: implement checking of actual proofs of storage, instead of dummy bool
// TODO: allow other host to take over contract when too many missed proofs
// TODO: small partial payouts when proofs are being submitted
// TODO: reward caller of markProofAsMissing
