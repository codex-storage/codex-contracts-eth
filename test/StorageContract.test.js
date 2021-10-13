const { expect } = require("chai")
const { ethers } = require("hardhat")
const { hashRequest, hashBid, sign } = require("./marketplace")

describe("Storage Contract", function () {

  const duration = 31 * 24 * 60 * 60
  const size = 1 * 1024 * 1024 * 1024
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

  })

  it("cannot be created when client signature is invalid", async function () {
    let invalidSignature = await sign(client, hashRequest(duration + 1, size))
    await expect(StorageContract.deploy(
      duration,
      size,
      price,
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
      await host.getAddress(),
      await sign(client, requestHash),
      invalidSignature
    )).to.be.revertedWith("Invalid signature")
  })
})

// TDOO: add root hash of data
// TODO: payment on constructor
// TODO: contract start and timeout
// TODO: missed proofs
// TODO: successfull proofs
// TODO: payout
// TODO: stake
// TODO: request expiration
// TODO: bid expiration
// TODO: multiple hosts in single contract
