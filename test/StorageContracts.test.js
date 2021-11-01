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
  const nonce = ethers.utils.randomBytes(32)

  var contracts
  var client, host
  var bidExpiry
  var requestHash, bidHash
  var id

  beforeEach(async function () {
    [client, host] = await ethers.getSigners()
    let StorageContracts = await ethers.getContractFactory("StorageContracts")
    contracts = await StorageContracts.deploy()
    requestHash = hashRequest(
      duration,
      size,
      contentHash,
      proofPeriod,
      proofTimeout,
      nonce
    )
    bidExpiry = Math.round(Date.now() / 1000) + 60 * 60 // 1 hour from now
    bidHash = hashBid(requestHash, bidExpiry, price)
    id = bidHash
  })

  describe("when properly instantiated", function () {

    beforeEach(async function () {
      await contracts.newContract(
        duration,
        size,
        contentHash,
        price,
        proofPeriod,
        proofTimeout,
        nonce,
        bidExpiry,
        await host.getAddress(),
        await sign(client, requestHash),
        await sign(host, bidHash)
      )
    })

    it("has a duration", async function () {
      expect(await contracts.duration(id)).to.equal(duration)
    })

    it("contains the size of the data that is to be stored", async function () {
      expect(await contracts.size(id)).to.equal(size)
    })

    it("contains the hash of the data that is to be stored", async function () {
      expect(await contracts.contentHash(id)).to.equal(contentHash)
    })

    it("has a price", async function () {
      expect(await contracts.price(id)).to.equal(price)
    })

    it("knows the host that provides the storage", async function () {
      expect(await contracts.host(id)).to.equal(await host.getAddress())
    })

    it("has an average time between proofs (in blocks)", async function (){
      expect(await contracts.proofPeriod(id)).to.equal(proofPeriod)
    })

    it("has a proof timeout (in blocks)", async function (){
      expect(await contracts.proofTimeout(id)).to.equal(proofTimeout)
    })
  })

  it("cannot be created when contract id already used", async function () {
    await contracts.newContract(
      duration,
      size,
      contentHash,
      price,
      proofPeriod,
      proofTimeout,
      nonce,
      bidExpiry,
      await host.getAddress(),
      await sign(client, requestHash),
      await sign(host, bidHash)
    )
    await expect(contracts.newContract(
      duration,
      size,
      contentHash,
      price,
      proofPeriod,
      proofTimeout,
      nonce,
      bidExpiry,
      await host.getAddress(),
      await sign(client, requestHash),
      await sign(host, bidHash)
    )).to.be.revertedWith("A contract with this id already exists")
  })

  it("cannot be created when client signature is invalid", async function () {
    let invalidHash = hashRequest(
      duration + 1,
      size,
      contentHash,
      proofPeriod,
      proofTimeout,
      nonce
    )
    let invalidSignature = await sign(client, invalidHash)
    await expect(contracts.newContract(
      duration,
      size,
      contentHash,
      price,
      proofPeriod,
      proofTimeout,
      nonce,
      bidExpiry,
      await host.getAddress(),
      invalidSignature,
      await sign(host, bidHash)
    )).to.be.revertedWith("Invalid signature")
  })

  it("cannot be created when host signature is invalid", async function () {
    let invalidBid = hashBid(requestHash, bidExpiry, price - 1)
    let invalidSignature = await sign(host, invalidBid)
    await expect(contracts.newContract(
      duration,
      size,
      contentHash,
      price,
      proofPeriod,
      proofTimeout,
      nonce,
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
      invalidTimeout,
      nonce
    )
    bidHash = hashBid(requestHash, bidExpiry, price)
    await expect(contracts.newContract(
      duration,
      size,
      contentHash,
      price,
      proofPeriod,
      invalidTimeout,
      nonce,
      bidExpiry,
      await host.getAddress(),
      await sign(client, requestHash),
      await sign(host, bidHash),
    )).to.be.revertedWith("Invalid proof timeout")
  })

  it("cannot be created when bid has expired", async function () {
    let expired = Math.round(Date.now() / 1000) - 60 // 1 minute ago
    let bidHash = hashBid(requestHash, expired, price)
    await expect(contracts.newContract(
      duration,
      size,
      contentHash,
      price,
      proofPeriod,
      proofTimeout,
      nonce,
      expired,
      await host.getAddress(),
      await sign(client, requestHash),
      await sign(host, bidHash),
    )).to.be.revertedWith("Bid expired")
  })
})

// TODO: implement checking of actual proofs of storage, instead of dummy bool
// TODO: payment on constructor
// TODO: contract start and timeout
// TODO: only allow proofs after start of contract
// TODO: payout
// TODO: stake
