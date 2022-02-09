const { expect } = require("chai")
const { ethers } = require("hardhat")
const { hashRequest, hashBid, sign } = require("./marketplace")
const { exampleRequest, exampleBid } = require("./examples")

describe("Contracts", function () {
  const request = exampleRequest()
  const bid = exampleBid()

  let client, host
  let contracts
  let requestHash, bidHash
  let id

  beforeEach(async function () {
    ;[client, host] = await ethers.getSigners()
    let Contracts = await ethers.getContractFactory("TestContracts")
    contracts = await Contracts.deploy()
    requestHash = hashRequest(request)
    bidHash = hashBid({ ...bid, requestHash })
    id = bidHash
  })

  it("creates a new storage contract", async function () {
    await contracts.newContract(
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
    expect(await contracts.duration(id)).to.equal(request.duration)
    expect(await contracts.size(id)).to.equal(request.size)
    expect(await contracts.contentHash(id)).to.equal(request.contentHash)
    expect(await contracts.price(id)).to.equal(bid.price)
    expect(await contracts.host(id)).to.equal(await host.getAddress())
  })

  it("does not allow reuse of contract ids", async function () {
    await contracts.newContract(
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
    await expect(
      contracts.newContract(
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
    ).to.be.revertedWith("Contract already exists")
  })

  it("cannot be created when client signature is invalid", async function () {
    let invalidHash = hashRequest({
      ...request,
      duration: request.duration + 1,
    })
    let invalidSignature = await sign(client, invalidHash)
    await expect(
      contracts.newContract(
        request.duration,
        request.size,
        request.contentHash,
        request.proofPeriod,
        request.proofTimeout,
        request.nonce,
        bid.price,
        await host.getAddress(),
        bid.bidExpiry,
        invalidSignature,
        await sign(host, bidHash)
      )
    ).to.be.revertedWith("Invalid signature")
  })

  it("cannot be created when host signature is invalid", async function () {
    let invalidBid = hashBid({ ...bid, requestHash, price: bid.price - 1 })
    let invalidSignature = await sign(host, invalidBid)
    await expect(
      contracts.newContract(
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
        invalidSignature
      )
    ).to.be.revertedWith("Invalid signature")
  })

  it("cannot be created when bid has expired", async function () {
    let expired = Math.round(Date.now() / 1000) - 60 // 1 minute ago
    let bidHash = hashBid({ ...bid, requestHash, bidExpiry: expired })
    await expect(
      contracts.newContract(
        request.duration,
        request.size,
        request.contentHash,
        request.proofPeriod,
        request.proofTimeout,
        request.nonce,
        bid.price,
        await host.getAddress(),
        expired,
        await sign(client, requestHash),
        await sign(host, bidHash)
      )
    ).to.be.revertedWith("Bid expired")
  })
})
