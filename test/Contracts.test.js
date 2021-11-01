const { expect } = require("chai")
const { ethers } = require("hardhat")
const { hashRequest, hashBid, sign } = require("./marketplace")

describe("Storage Contracts", function () {

  const duration = 31 * 24 * 60 * 60 // 31 days
  const size = 1 * 1024 * 1024 * 1024 // 1 Gigabyte
  const contentHash = ethers.utils.sha256("0xdeadbeef")
  const proofPeriod = 8 // 8 blocks ≈ 2 minutes
  const proofTimeout = 4 // 4 blocks ≈ 1 minute
  const price = 42
  const nonce = ethers.utils.randomBytes(32)

  let client, host
  let contracts
  let bidExpiry
  let requestHash, bidHash
  let id

  beforeEach(async function () {
    [client, host] = await ethers.getSigners()
    let Contracts = await ethers.getContractFactory("TestContracts")
    contracts = await Contracts.deploy()
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

  it("creates a new storage contract", async function () {
    await contracts.newContract(
      duration,
      size,
      contentHash,
      proofPeriod,
      proofTimeout,
      nonce,
      price,
      await host.getAddress(),
      bidExpiry,
      await sign(client, requestHash),
      await sign(host, bidHash)
    )
    expect(await contracts.duration(id)).to.equal(duration)
    expect(await contracts.size(id)).to.equal(size)
    expect(await contracts.contentHash(id)).to.equal(contentHash)
    expect(await contracts.price(id)).to.equal(price)
    expect(await contracts.host(id)).to.equal(await host.getAddress())
  })

  it("does not allow reuse of contract ids", async function () {
    await contracts.newContract(
      duration,
      size,
      contentHash,
      proofPeriod,
      proofTimeout,
      nonce,
      price,
      await host.getAddress(),
      bidExpiry,
      await sign(client, requestHash),
      await sign(host, bidHash)
    )
    await expect(contracts.newContract(
      duration,
      size,
      contentHash,
      proofPeriod,
      proofTimeout,
      nonce,
      price,
      await host.getAddress(),
      bidExpiry,
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
      proofPeriod,
      proofTimeout,
      nonce,
      price,
      await host.getAddress(),
      bidExpiry,
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
      proofPeriod,
      proofTimeout,
      nonce,
      price,
      await host.getAddress(),
      bidExpiry,
      await sign(client, requestHash),
      invalidSignature
    )).to.be.revertedWith("Invalid signature")
  })

  it("cannot be created when bid has expired", async function () {
    let expired = Math.round(Date.now() / 1000) - 60 // 1 minute ago
    let bidHash = hashBid(requestHash, expired, price)
    await expect(contracts.newContract(
      duration,
      size,
      contentHash,
      proofPeriod,
      proofTimeout,
      nonce,
      price,
      await host.getAddress(),
      expired,
      await sign(client, requestHash),
      await sign(host, bidHash),
    )).to.be.revertedWith("Bid expired")
  })
})
