const { expect } = require("chai")
const { ethers } = require("hardhat")
const { hashRequest, hashBid, sign } = require("./marketplace")
const { exampleRequest, exampleBid } = require("./examples")

describe("Storage", function () {

  const stakeAmount = 100
  const request = exampleRequest()
  const bid = exampleBid()

  let storage
  let token
  let client, host

  beforeEach(async function () {
    [client, host] = await ethers.getSigners()
    let Token = await ethers.getContractFactory("TestToken")
    let StorageContracts = await ethers.getContractFactory("Storage")
    token = await Token.connect(host).deploy()
    storage = await StorageContracts.deploy(token.address, stakeAmount)
  })

  describe("creating a new storage contract", function () {

    let id

    beforeEach(async function () {
      await token.approve(storage.address, stakeAmount)
      await storage.connect(host).increaseStake(stakeAmount)
      let requestHash = hashRequest(request)
      let bidHash = hashBid({...bid, requestHash})
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

    it("locks up host stake", async function () {
      await expect(
        storage.connect(host).withdrawStake()
      ).to.be.revertedWith("Stake locked")
    })

    describe("starting the contract", function () {
      it("starts requiring storage proofs", async function (){
        await storage.connect(host).startContract(id)
        expect(await storage.proofEnd(id)).to.be.gt(0)
      })

      it("can only be done by the host", async function () {
        await expect(
          storage.connect(client).startContract(id)
        ).to.be.revertedWith("Only host can call this function")
      })
    })
  })

  it("doesn't create contract with insufficient stake", async function () {
    await token.approve(storage.address, stakeAmount - 1)
    await storage.connect(host).increaseStake(stakeAmount - 1)
    let requestHash = hashRequest(request)
    let bidHash = hashBid({...bid, requestHash})
    await expect(storage.newContract(
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
    )).to.be.revertedWith("Insufficient stake")
  })
})

// TODO: unlock stake at end of contract
// TODO: payment when new contract
// TODO: contract start and timeout
// TODO: failure to start contract burns host and client
// TODO: implement checking of actual proofs of storage, instead of dummy bool
// TODO: only allow proofs after start of contract
// TODO: proofs no longer required after contract duration
// TODO: payout
