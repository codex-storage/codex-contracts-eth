const { expect } = require("chai")
const { ethers } = require("hardhat")
const { hexlify, randomBytes } = ethers.utils
const {
  snapshot,
  revert,
  mine,
  ensureMinimumBlockHeight,
  currentTime,
  advanceTimeForNextBlock,
  advanceTimeToForNextBlock,
} = require("./evm")
const { periodic } = require("./time")
const { loadProof } = require("./proof")
const { SlotState } = require("./requests")
const binomialTest = require("@stdlib/stats-binomial-test")

describe("Proofs", function () {
  const slotId = hexlify(randomBytes(32))
  const period = 30 * 60
  const timeout = 5
  const downtime = 64
  const probability = 4 // require a proof roughly once every 4 periods
  const { periodOf, periodEnd } = periodic(period)

  let proofs

  beforeEach(async function () {
    await snapshot()
    await ensureMinimumBlockHeight(256)
    const Proofs = await ethers.getContractFactory("TestProofs")
    const Verifier = await ethers.getContractFactory(
      "contracts/verifiers/testing/verifier.sol:Groth16Verifier"
    )
    const verifier = await Verifier.deploy()
    proofs = await Proofs.deploy(
      { period, timeout, downtime },
      verifier.address
    )
  })

  afterEach(async function () {
    await revert()
  })

  describe("general", function () {
    beforeEach(async function () {
      await proofs.setSlotState(slotId, SlotState.Filled)
    })

    it("requires proofs with an agreed upon probability", async function () {
      const samples = 256 // 256 samples avoids bias due to pointer downtime

      await proofs.startRequiringProofs(slotId, probability)
      await advanceTimeForNextBlock(period)
      await mine()
      let amount = 0
      for (let i = 0; i < samples; i++) {
        if (await proofs.isProofRequired(slotId)) {
          amount += 1
        }
        await advanceTimeForNextBlock(period)
        await mine()
      }

      const p = 1 / probability // expected probability
      const alpha = 1 / 1000 // unit test can fail once every 1000 runs

      // use binomial test to check that the measured amount is likely to occur
      expect(binomialTest(amount, samples, { p, alpha }).rejected).to.be.false
    })

    it("supports probability 1 (proofs are always required)", async function () {
      await proofs.startRequiringProofs(slotId, 1)
      await advanceTimeForNextBlock(period)
      await mine()
      while ((await proofs.getPointer(slotId)) < downtime) {
        await mine()
      }
      expect(await proofs.isProofRequired(slotId)).to.be.true
    })

    it("requires no proofs in the start period", async function () {
      const startPeriod = Math.floor((await currentTime()) / period)
      const probability = 1
      await proofs.startRequiringProofs(slotId, probability)
      while (Math.floor((await currentTime()) / period) == startPeriod) {
        expect(await proofs.isProofRequired(slotId)).to.be.false
        await advanceTimeForNextBlock(Math.floor(period / 10))
        await mine()
      }
    })

    it("requires proofs for different ids at different times", async function () {
      let id1 = hexlify(randomBytes(32))
      let id2 = hexlify(randomBytes(32))
      let id3 = hexlify(randomBytes(32))
      for (let slotId of [id1, id2, id3]) {
        await proofs.setSlotState(slotId, SlotState.Filled)
        await proofs.startRequiringProofs(slotId, probability)
      }
      let req1, req2, req3
      while (req1 === req2 && req2 === req3) {
        req1 = await proofs.isProofRequired(id1)
        req2 = await proofs.isProofRequired(id2)
        req3 = await proofs.isProofRequired(id3)
        await advanceTimeForNextBlock(period)
        await mine()
      }
    })

    it("moves pointer one block at a time", async function () {
      await advanceTimeToForNextBlock(periodEnd(periodOf(await currentTime())))
      await mine()
      for (let i = 0; i < 256; i++) {
        let previous = await proofs.getPointer(slotId)
        await mine()
        let current = await proofs.getPointer(slotId)
        expect(current).to.equal((previous + 1) % 256)
      }
    })
  })

  describe("when proof requirement is upcoming", function () {
    async function waitUntilProofWillBeRequired() {
      while (!(await proofs.willProofBeRequired(slotId))) {
        await mine()
      }
    }

    beforeEach(async function () {
      await proofs.setSlotState(slotId, SlotState.Filled)
      await proofs.startRequiringProofs(slotId, probability)
      await advanceTimeToForNextBlock(periodEnd(periodOf(await currentTime())))
      await waitUntilProofWillBeRequired()
    })

    it("means the pointer is in downtime", async function () {
      expect(await proofs.getPointer(slotId)).to.be.lt(downtime)
      while ((await proofs.getPointer(slotId)) < downtime) {
        expect(await proofs.willProofBeRequired(slotId)).to.be.true
        await mine()
      }
    })

    it("means that a proof is required after downtime", async function () {
      while ((await proofs.getPointer(slotId)) < downtime) {
        await mine()
      }
      expect(await proofs.willProofBeRequired(slotId)).to.be.false
      expect(await proofs.isProofRequired(slotId)).to.be.true
    })

    it("will not require proofs when slot is finished", async function () {
      expect(await proofs.getPointer(slotId)).to.be.lt(downtime)
      expect(await proofs.willProofBeRequired(slotId)).to.be.true
      await proofs.setSlotState(slotId, SlotState.Finished)
      expect(await proofs.willProofBeRequired(slotId)).to.be.false
    })
  })

  describe("when proofs are required", function () {
    const proof = loadProof("testing")

    beforeEach(async function () {
      await proofs.setSlotState(slotId, SlotState.Filled)
      await proofs.startRequiringProofs(slotId, probability)
    })

    async function waitUntilProofIsRequired(slotId) {
      await advanceTimeToForNextBlock(periodEnd(periodOf(await currentTime())))
      await mine()

      while (
        !(
          (await proofs.isProofRequired(slotId)) &&
          (await proofs.getPointer(slotId)) < 250
        )
      ) {
        await advanceTimeForNextBlock(period)
        await mine()
      }
    }

    it("provides different challenges per period", async function () {
      await waitUntilProofIsRequired(slotId)
      const challenge1 = await proofs.getChallenge(slotId)
      await waitUntilProofIsRequired(slotId)
      const challenge2 = await proofs.getChallenge(slotId)
      expect(challenge2).not.to.equal(challenge1)
    })

    it("provides different challenges per slotId", async function () {
      const id2 = hexlify(randomBytes(32))
      const id3 = hexlify(randomBytes(32))
      const challenge1 = await proofs.getChallenge(slotId)
      const challenge2 = await proofs.getChallenge(id2)
      const challenge3 = await proofs.getChallenge(id3)
      expect(challenge1 === challenge2 && challenge2 === challenge3).to.be.false
    })

    it("submits a correct proof", async function () {
      await proofs.submitProof(slotId, ...proof)
    })

    it("fails proof submission when proof is incorrect", async function () {
      await expect(
        proofs.submitProof(
          slotId,
          [
            "0x1bcdb9a3c52070f56e8d59b29239f0528817f99745157ce4d03faefddfff6acc",
            "0x2496ab7dd8f0596c21653105e4af7e48eb5395ea45e0c876d7db4dd31b4df23e",
          ],
          [
            [
              "0x002ef03c350ccfbf234bfde498378709edea3a506383d492b58c4c35ffecc508",
              "0x174d475745707d35989001e9216201bdb828130b0e78dbf772c4795fa845b5eb",
            ],
            [
              "0x1f04519f202fac14311c65d827f65f787dbe01985044278292723b9ee77ce5ee",
              "0x1c42f4d640e94c28401392031e74426ae68145f4f520cd576ca5e5b9af97c0bb",
            ],
          ],
          [
            "0x1db1e61b32db677f3927ec117569e068f62747986e4ac7f54db8f2acd17e4abc",
            "0x20a59e1daca2ab80199c5bca2c5a7d6de6348bd795a0dd999752cc462d851128",
          ],
          [
            "0x00000000000000000000000000000000000000000000000000000001b9b78422",
            "0x2389b3770d31a09a71cda2cb2114c203172eac63b61f76cb9f81db7adbe8fc9d",
            "0x0000000000000000000000000000000000000000000000000000000000000003",
          ]
        )
      ).to.be.revertedWith("Invalid proof")
    })

    it("emits an event when proof was submitted", async function () {
      await expect(proofs.submitProof(slotId, ...proof)).to.emit(
        proofs,
        "ProofSubmitted"
      )
      // .withArgs(slotId, proof) // TODO: Update when ProofSubmitted updated
    })

    it("fails proof submission when already submitted", async function () {
      await advanceTimeToForNextBlock(periodEnd(periodOf(await currentTime())))
      await proofs.submitProof(slotId, ...proof)
      await expect(proofs.submitProof(slotId, ...proof)).to.be.revertedWith(
        "Proof already submitted"
      )
    })

    it("marks a proof as missing", async function () {
      expect(await proofs.missingProofs(slotId)).to.equal(0)
      await waitUntilProofIsRequired(slotId)
      let missedPeriod = periodOf(await currentTime())
      await advanceTimeToForNextBlock(periodEnd(missedPeriod))
      await mine()
      await proofs.markProofAsMissing(slotId, missedPeriod)
      expect(await proofs.missingProofs(slotId)).to.equal(1)
    })

    it("does not mark a proof as missing before period end", async function () {
      await waitUntilProofIsRequired(slotId)
      let currentPeriod = periodOf(await currentTime())
      await expect(
        proofs.markProofAsMissing(slotId, currentPeriod)
      ).to.be.revertedWith("Period has not ended yet")
    })

    it("does not mark a proof as missing after timeout", async function () {
      await waitUntilProofIsRequired(slotId)
      let currentPeriod = periodOf(await currentTime())
      await advanceTimeToForNextBlock(periodEnd(currentPeriod) + timeout)
      await expect(
        proofs.markProofAsMissing(slotId, currentPeriod)
      ).to.be.revertedWith("Validation timed out")
    })

    it("does not mark a submitted proof as missing", async function () {
      await waitUntilProofIsRequired(slotId)
      let submittedPeriod = periodOf(await currentTime())
      await proofs.submitProof(slotId, ...proof)
      await advanceTimeToForNextBlock(periodEnd(submittedPeriod))
      await mine()
      await expect(
        proofs.markProofAsMissing(slotId, submittedPeriod)
      ).to.be.revertedWith("Proof was submitted, not missing")
    })

    it("does not mark proof as missing when not required", async function () {
      while (await proofs.isProofRequired(slotId)) {
        await advanceTimeForNextBlock(period)
        await mine()
      }
      let currentPeriod = periodOf(await currentTime())
      await advanceTimeToForNextBlock(periodEnd(currentPeriod))
      await mine()
      await expect(
        proofs.markProofAsMissing(slotId, currentPeriod)
      ).to.be.revertedWith("Proof was not required")
    })

    it("does not mark proof as missing twice", async function () {
      await waitUntilProofIsRequired(slotId)
      let missedPeriod = periodOf(await currentTime())
      await advanceTimeToForNextBlock(periodEnd(missedPeriod))
      await mine()
      await proofs.markProofAsMissing(slotId, missedPeriod)
      await expect(
        proofs.markProofAsMissing(slotId, missedPeriod)
      ).to.be.revertedWith("Proof already marked as missing")
    })

    it("requires no proofs when slot is finished", async function () {
      await waitUntilProofIsRequired(slotId)
      await proofs.setSlotState(slotId, SlotState.Finished)
      expect(await proofs.isProofRequired(slotId)).to.be.false
    })
  })
})
