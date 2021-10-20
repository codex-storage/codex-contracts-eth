const { expect } = require("chai")
const { ethers } = require("hardhat")
const { hashRequest, hashBid, sign } = require("./marketplace")

describe("Storage Contracts", function () {

  const duration = 31 * 24 * 60 * 60 // 31 days
  const size = 1 * 1024 * 1024 * 1024 // 1 Gigabyte
  const contentHash = ethers.utils.sha256("0xdeadbeef") // hash of content
  const proofPeriod = 8 // 8 blocks ≈ 2 minutes
  const proofTimeout = 4 // 4 blocks ≈ 1 minute
  const price = 42

  var StorageContracts
  var client, host
  var bidExpiry
  var requestHash, bidHash
  var contract

  beforeEach(async function () {
    [client, host] = await ethers.getSigners()
    StorageContracts = await ethers.getContractFactory("StorageContracts")
    requestHash = hashRequest(
      duration,
      size,
      contentHash,
      proofPeriod,
      proofTimeout
    )
    bidExpiry = Math.round(Date.now() / 1000) + 60 * 60 // 1 hour from now
    bidHash = hashBid(requestHash, bidExpiry, price)
  })

  describe("when properly instantiated", function () {

    beforeEach(async function () {
      contract = await StorageContracts.deploy(
        duration,
        size,
        contentHash,
        price,
        proofPeriod,
        proofTimeout,
        bidExpiry,
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

    it("contains the hash of the data that is to be stored", async function () {
      expect(await contract.contentHash()).to.equal(contentHash)
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
    let invalidHash = hashRequest(
      duration + 1,
      size,
      contentHash,
      proofPeriod,
      proofTimeout
    )
    let invalidSignature = await sign(client, invalidHash)
    await expect(StorageContract.deploy(
      duration,
      size,
      contentHash,
      price,
      proofPeriod,
      proofTimeout,
      bidExpiry,
      await host.getAddress(),
      invalidSignature,
      await sign(host, bidHash)
    )).to.be.revertedWith("Invalid signature")
  })

  it("cannot be created when host signature is invalid", async function () {
    let invalidBid = hashBid(requestHash, bidExpiry, price - 1)
    let invalidSignature = await sign(host, invalidBid)
    await expect(StorageContract.deploy(
      duration,
      size,
      contentHash,
      price,
      proofPeriod,
      proofTimeout,
      bidExpiry,
      await host.getAddress(),
      await sign(client, requestHash),
      invalidSignature
    )).to.be.revertedWith("Invalid signature")
  })

  it("cannot be created when proof timeout is too large", async function () {
    let invalidTimeout = 129 // max proof timeout is 128 blocks
    requestHash = hashRequest(
      duration,
      size,
      contentHash,
      proofPeriod,
      invalidTimeout
    )
    bidHash = hashBid(requestHash, bidExpiry, price)
    await expect(StorageContract.deploy(
      duration,
      size,
      contentHash,
      price,
      proofPeriod,
      invalidTimeout,
      bidExpiry,
      await host.getAddress(),
      await sign(client, requestHash),
      await sign(host, bidHash),
    )).to.be.revertedWith("Invalid proof timeout")
  })

  it("cannot be created when bid has expired", async function () {
    let expired = Math.round(Date.now() / 1000) - 60 // 1 minute ago
    let bidHash = hashBid(requestHash, expired, price)
    await expect(StorageContract.deploy(
      duration,
      size,
      contentHash,
      price,
      proofPeriod,
      proofTimeout,
      expired,
      await host.getAddress(),
      await sign(client, requestHash),
      await sign(host, bidHash),
    )).to.be.revertedWith("Bid expired")
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

    async function mineUntilProofTimeout() {
      for (let i=0; i<proofTimeout; i++) {
        mineBlock()
      }
    }

    beforeEach(async function () {
      contract = await StorageContract.deploy(
        duration,
        size,
        contentHash,
        price,
        proofPeriod,
        proofTimeout,
        bidExpiry,
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

    it("submits a correct proof", async function () {
      await mineUntilProofIsRequired()
      let blocknumber = await minedBlockNumber()
      await contract.submitProof(blocknumber, true)
    })

    it("fails proof submission when proof is incorrect", async function () {
      await mineUntilProofIsRequired()
      let blocknumber = await minedBlockNumber()
      await expect(
        contract.submitProof(blocknumber, false)
      ).to.be.revertedWith("Invalid proof")
    })

    it("fails proof submission when proof was not required", async function () {
      while (await contract.isProofRequired(await minedBlockNumber())) {
        await mineBlock()
      }
      let blocknumber = await minedBlockNumber()
      await expect(
        contract.submitProof(blocknumber, true)
      ).to.be.revertedWith("No proof required")
    })

    it("fails proof submission when proof is too late", async function () {
      await mineUntilProofIsRequired()
      let blocknumber = await minedBlockNumber()
      await mineUntilProofTimeout()
      await expect(
        contract.submitProof(blocknumber, true)
      ).to.be.revertedWith("Proof not allowed after timeout")
    })

    it("fails proof submission when already submitted", async function() {
      await mineUntilProofIsRequired()
      let blocknumber = await minedBlockNumber()
      await contract.submitProof(blocknumber, true)
      await expect(
        contract.submitProof(blocknumber, true)
      ).to.be.revertedWith("Proof already submitted")
    })

    it("marks a proof as missing", async function () {
      expect(await contract.missingProofs()).to.equal(0)
      await mineUntilProofIsRequired()
      let blocknumber = await minedBlockNumber()
      await mineUntilProofTimeout()
      await contract.markProofAsMissing(blocknumber)
      expect(await contract.missingProofs()).to.equal(1)
    })

    it("does not mark a proof as missing before timeout", async function () {
      await mineUntilProofIsRequired()
      let blocknumber = await minedBlockNumber()
      await mineBlock()
      await expect(
        contract.markProofAsMissing(blocknumber)
      ).to.be.revertedWith("Proof has not timed out yet")
    })

    it("does not mark a submitted proof as missing", async function () {
      await mineUntilProofIsRequired()
      let blocknumber = await minedBlockNumber()
      await contract.submitProof(blocknumber, true)
      await mineUntilProofTimeout()
      await expect(
        contract.markProofAsMissing(blocknumber)
      ).to.be.revertedWith("Proof was submitted, not missing")
    })

    it("does not mark proof as missing when not required", async function () {
      while (await contract.isProofRequired(await minedBlockNumber())) {
        mineBlock()
      }
      let blocknumber = await minedBlockNumber()
      await mineUntilProofTimeout()
      await expect(
        contract.markProofAsMissing(blocknumber)
      ).to.be.revertedWith("Proof was not required")
    })
  })
})

// TODO: implement checking of actual proofs of storage, instead of dummy bool
// TODO: payment on constructor
// TODO: contract start and timeout
// TODO: only allow proofs after start of contract
// TODO: payout
// TODO: stake
// TODO: multiple hosts in single contract
