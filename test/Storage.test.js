const { expect } = require("chai")
const { ethers } = require("hardhat")
const { hashRequest, hashBid, sign } = require("./marketplace")
const { exampleRequest, exampleBid } = require("./examples")

describe("Storage", function () {

  describe("creating a new storage contract", function () {

    const request = exampleRequest()
    const bid = exampleBid()

    let contracts
    let client, host
    let id

    beforeEach(async function () {
      [client, host] = await ethers.getSigners()
      let StorageContracts = await ethers.getContractFactory("Storage")
      contracts = await StorageContracts.deploy()
      let requestHash = hashRequest(request)
      let bidHash = hashBid({...bid, requestHash})
      id = bidHash
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
    })

    it("created the contract", async function () {
      expect(await contracts.duration(id)).to.equal(request.duration)
      expect(await contracts.size(id)).to.equal(request.size)
      expect(await contracts.contentHash(id)).to.equal(request.contentHash)
      expect(await contracts.price(id)).to.equal(bid.price)
      expect(await contracts.host(id)).to.equal(await host.getAddress())
    })

    it("requires storage proofs", async function (){
      expect(await contracts.proofPeriod(id)).to.equal(request.proofPeriod)
      expect(await contracts.proofTimeout(id)).to.equal(request.proofTimeout)
    })
  })
})

// TODO: implement checking of actual proofs of storage, instead of dummy bool
// TODO: payment on constructor
// TODO: contract start and timeout
// TODO: only allow proofs after start of contract
// TODO: payout
// TODO: stake
