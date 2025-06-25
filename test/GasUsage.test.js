const { ethers } = require("hardhat")
const {
  exampleRequest,
  exampleProof,
  exampleConfiguration,
} = require("./examples")
const { maxPrice } = require("./price")
const { collateralPerSlot } = require("./collateral")
const { requestId, slotId } = require("./ids")
const {
  revert,
  snapshot,
  ensureMinimumBlockHeight,
  advanceTimeTo,
  currentTime,
} = require("./evm")
const { expect } = require("chai")
const { patchOverloads } = require("./marketplace")
const { periodic } = require("./time")
const { RequestState } = require("./requests")

// Ensures that the actual gas costs can never deviate from the gas estimate by
// more than a certain percentage.
// The percentages from these tests should be used to pad the gas estimates in
// market.nim, for example when calling fillSlot:
// https://github.com/codex-storage/nim-codex/blob/6db6bf5f72a0038b77d02f48dcf128b4d77b469a/codex/contracts/market.nim#L278
describe("Marketplace gas estimates", function () {
  let marketplace
  let token
  let signer

  async function setupToken() {
    const Token = await ethers.getContractFactory("TestToken")
    const token = await Token.deploy()
    for (let signer of await ethers.getSigners()) {
      await token.mint(signer.address, 1_000_000_000_000_000)
    }
    return token
  }

  async function setupMarketplace() {
    const Marketplace = await ethers.getContractFactory("Marketplace")
    const Verifier = await ethers.getContractFactory("TestVerifier")
    const verifier = await Verifier.deploy()
    await ensureMinimumBlockHeight(256)
    const marketplace = await Marketplace.deploy(
      exampleConfiguration(),
      token.address,
      verifier.address
    )
    patchOverloads(marketplace)
    return marketplace
  }

  async function requestStorage() {
    const request = exampleRequest()
    request.client = signer.address
    await token.approve(marketplace.address, maxPrice(request))
    await marketplace.requestStorage(request)
    return request
  }

  async function startRequest(request) {
    const id = requestId(request)
    for (let i = 0; i < request.ask.slots; i++) {
      await marketplace.reserveSlot(id, i)
      await token.approve(marketplace.address, collateralPerSlot(request))
      await marketplace.fillSlot(id, i, exampleProof())
    }
  }

  beforeEach(async function () {
    await snapshot()
    signer = (await ethers.getSigners())[0]
    token = await setupToken()
    marketplace = await setupMarketplace()
  })

  afterEach(async function () {
    await revert()
  })

  describe("reserveSlot", function () {
    it("has at most 25% deviation in gas usage", async function () {
      const request = await requestStorage()
      const id = requestId(request)
      const gasUsage = []
      for (let signer of await ethers.getSigners()) {
        marketplace = marketplace.connect(signer)
        for (let i = 0; i < request.ask.slots; i++) {
          try {
            const transaction = await marketplace.reserveSlot(id, i)
            const receipt = await transaction.wait()
            gasUsage.push(receipt.gasUsed.toNumber())
          } catch (exception) {
            // ignore: reservations can be full
          }
        }
      }
      const deviation = Math.max(...gasUsage) / Math.min(...gasUsage) - 1.0
      expect(deviation).to.be.gt(0)
      expect(deviation).to.be.lte(0.25)
    })
  })

  describe("fillSlot", function () {
    it("has at most 10% deviation in gas usage", async function () {
      const request = await requestStorage()
      const id = requestId(request)
      const gasUsage = []
      for (let i = 0; i < request.ask.slots; i++) {
        await marketplace.reserveSlot(id, i)
        await token.approve(marketplace.address, collateralPerSlot(request))
        const transaction = await marketplace.fillSlot(id, i, exampleProof())
        const receipt = await transaction.wait()
        gasUsage.push(receipt.gasUsed.toNumber())
      }
      const deviation = Math.max(...gasUsage) / Math.min(...gasUsage) - 1.0
      expect(deviation).to.be.gt(0)
      expect(deviation).to.be.lte(0.1)
    })
  })

  describe("freeSlot", function () {
    it("has at most 200% deviation in gas usage", async function () {
      const request = await requestStorage()
      const id = requestId(request)
      await startRequest(request)
      const gasUsage = []
      for (let i = 0; i < request.ask.slots; i++) {
        const slot = { request: id, index: i }
        const transaction = await marketplace.freeSlot(slotId(slot))
        const receipt = await transaction.wait()
        gasUsage.push(receipt.gasUsed.toNumber())
      }
      const deviation = Math.max(...gasUsage) / Math.min(...gasUsage) - 1.0
      expect(deviation).to.be.gt(0)
      expect(deviation).to.be.lte(2.0)
    })
  })

  describe("markProofAsMissing", function () {
    let period, periodOf, periodEnd

    beforeEach(async function () {
      const configuration = await marketplace.configuration()
      period = configuration.proofs.period
      ;({ periodOf, periodEnd } = periodic(period))
    })

    it("has at most 50% deviation in gas usage", async function () {
      const request = await requestStorage()
      const id = requestId(request)
      await startRequest(request)
      const gasUsage = []
      while ((await marketplace.requestState(id)) != RequestState.Failed) {
        const missingPeriod = periodOf(await currentTime())
        await advanceTimeTo(periodEnd(missingPeriod) + 1)
        for (let i = 0; i < request.ask.slots; i++) {
          try {
            const slot = { request: id, index: i }
            const transaction = await marketplace.markProofAsMissing(
              slotId(slot),
              missingPeriod
            )
            const receipt = await transaction.wait()
            gasUsage.push(receipt.gasUsed.toNumber())
          } catch (exception) {
            // ignore: proof might not be missing
          }
        }
      }
      const deviation = Math.max(...gasUsage) / Math.min(...gasUsage) - 1.0
      expect(deviation).to.be.gt(0)
      expect(deviation).to.be.lte(0.5)
    })
  })
})
