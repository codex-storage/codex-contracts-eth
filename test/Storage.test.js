const { expect } = require("chai")
const { ethers } = require("hardhat")
const { hashRequest, hashBid, sign } = require("./marketplace")
const { examples } = require("./examples")

describe("Storage", function () {

  describe("creating a new storage contract", function () {

    const {
      duration,
      size,
      contentHash,
      proofPeriod,
      proofTimeout,
      price,
      nonce,
      bidExpiry
    } = examples()

    let contracts
    let client, host
    let id

    beforeEach(async function () {
      [client, host] = await ethers.getSigners()
      let StorageContracts = await ethers.getContractFactory("Storage")
      contracts = await StorageContracts.deploy()
      let requestHash = hashRequest(
        duration,
        size,
        contentHash,
        proofPeriod,
        proofTimeout,
        nonce
      )
      let bidHash = hashBid(requestHash, bidExpiry, price)
      id = bidHash
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
    })

    it("created the contract", async function () {
      expect(await contracts.duration(id)).to.equal(duration)
      expect(await contracts.size(id)).to.equal(size)
      expect(await contracts.contentHash(id)).to.equal(contentHash)
      expect(await contracts.price(id)).to.equal(price)
      expect(await contracts.host(id)).to.equal(await host.getAddress())
    })

    it("requires storage proofs", async function (){
      expect(await contracts.proofPeriod(id)).to.equal(proofPeriod)
      expect(await contracts.proofTimeout(id)).to.equal(proofTimeout)
    })
  })
})

// TODO: implement checking of actual proofs of storage, instead of dummy bool
// TODO: payment on constructor
// TODO: contract start and timeout
// TODO: only allow proofs after start of contract
// TODO: payout
// TODO: stake
