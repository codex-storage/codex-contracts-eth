const { expect } = require("chai")
const { ethers } = require("hardhat")
const { hashRequest, hashBid, sign } = require("./marketplace")

describe("Storage Contract", function () {

  const duration = 31 * 24 * 60 * 60 // 31 days
  const size = 1 * 1024 * 1024 * 1024 // 1 Gigabyte
  const proofPeriod = 8 // 8 blocks ≈ 2 minutes
  const proofTimeout = 4 // 4 blocks ≈ 1 minute
  const price = 42

  var StorageContract
  var client, host
  var requestHash, bidHash
  var contract

  beforeEach(async function () {
    [client, host] = await ethers.getSigners()
    StorageContract = await ethers.getContractFactory("StorageContract")
    requestHash = hashRequest(duration, size)
    bidHash = hashBid(requestHash, price)
  })

  describe("when properly instantiated", function () {

    beforeEach(async function () {
      contract = await StorageContract.deploy(
        duration,
        size,
        price,
        proofPeriod,
        proofTimeout,
        await host.getAddress(),
        await sign(client, requestHash),
        await sign(host, bidHash)
      )
    })

    it("has a duration", async function () {
      expect(await contract.duration()).to.equal(duration)
    })

    it("contains the size of the data that is to be stored", async function () {
      expect(await contract.size()).to.equal(size)
    })

    it("has a price", async function () {
      expect(await contract.price()).to.equal(price)
    })

    it("knows the host that provides the storage", async function () {
      expect(await contract.host()).to.equal(await host.getAddress())
    })

    it("has an average time between proofs (in blocks)", async function (){
      expect(await contract.proofPeriod()).to.equal(proofPeriod)
    })

    it("has a proof timeout (in blocks)", async function (){
      expect(await contract.proofTimeout()).to.equal(proofTimeout)
    })
  })

  it("cannot be created when client signature is invalid", async function () {
    let invalidSignature = await sign(client, hashRequest(duration + 1, size))
    await expect(StorageContract.deploy(
      duration,
      size,
      price,
      proofPeriod,
      proofTimeout,
      await host.getAddress(),
      invalidSignature,
      await sign(host, bidHash)
    )).to.be.revertedWith("Invalid signature")
  })

  it("cannot be created when host signature is invalid", async function () {
    let invalidSignature = await sign(host, hashBid(requestHash, price - 1))
    await expect(StorageContract.deploy(
      duration,
      size,
      price,
      proofPeriod,
      proofTimeout,
      await host.getAddress(),
      await sign(client, requestHash),
      invalidSignature
    )).to.be.revertedWith("Invalid signature")
  })

  it("cannot be created when proof timeout is too large", async function () {
    let invalidTimeout = 129 // max proof timeout is 128 blocks
    await expect(StorageContract.deploy(
      duration,
      size,
      price,
      proofPeriod,
      invalidTimeout,
      await host.getAddress(),
      await sign(client, requestHash),
      await sign(host, bidHash),
    )).to.be.revertedWith("Invalid proof timeout")
  })

  describe("proofs", function () {

    async function mineBlock() {
      await ethers.provider.send("evm_mine")
    }

    async function minedBlockNumber() {
      return await ethers.provider.getBlockNumber() - 1
    }

    async function mineUntilProofIsRequired() {
      while (!await contract.isProofRequired(await minedBlockNumber())) {
        mineBlock()
      }
    }

    beforeEach(async function () {
      contract = await StorageContract.deploy(
        duration,
        size,
        price,
        proofPeriod,
        proofTimeout,
        await host.getAddress(),
        await sign(client, requestHash),
        await sign(host, bidHash)
      )
    })

    it("requires on average a proof every period", async function () {
      let blocks = 400
      let proofs = 0
      for (i=0; i<blocks; i++) {
        await mineBlock()
        if (await contract.isProofRequired(await minedBlockNumber())) {
          proofs += 1
        }
      }
      let average = blocks / proofs
      expect(average).to.be.closeTo(proofPeriod, proofPeriod / 2)
    })

    it("requires no proof for blocks that are unavailable", async function () {
      await mineUntilProofIsRequired()
      let blocknumber = await minedBlockNumber()
      for (i=0; i<256; i++) { // only last 256 blocks are available in solidity
        mineBlock()
      }
      expect(await contract.isProofRequired(blocknumber)).to.be.false
    })

  })
})

// TDOO: add root hash of data
// TODO: payment on constructor
// TODO: contract start and timeout
// TODO: missed proofs
// TODO: successfull proofs
// TODO: only allow proofs after start of contract
// TODO: payout
// TODO: stake
// TODO: request expiration
// TODO: bid expiration
// TODO: multiple hosts in single contract
