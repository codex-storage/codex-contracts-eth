const { expect } = require("chai")
const { ethers } = require("hardhat")
const { mineBlock, minedBlockNumber } = require("./evm")
const {
  snapshot,
  revert,
  currentTime,
  advanceTime,
  advanceTimeTo,
} = require("./evm")

describe("Proofs", function () {
  const id = ethers.utils.randomBytes(32)
  const period = 10
  const timeout = 5
  const duration = 1000
  const probability = 2 // require a proof roughly once every 2² periods

  let proofs

  async function ensureEnoughBlockHistory() {
    while ((await minedBlockNumber()) < 256) {
      await mineBlock()
    }
  }

  beforeEach(async function () {
    await snapshot()
    await ensureEnoughBlockHistory()
    const Proofs = await ethers.getContractFactory("TestProofs")
    proofs = await Proofs.deploy(period, timeout)
  })

  afterEach(async function () {
    await revert()
  })

  it("calculates an end time based on duration", async function () {
    await proofs.expectProofs(id, probability, duration)
    let end = (await currentTime()) + duration
    expect((await proofs.end(id)).toNumber()).to.be.closeTo(end, 1)
  })

  it("does not allow ids to be reused", async function () {
    await proofs.expectProofs(id, probability, duration)
    await expect(
      proofs.expectProofs(id, probability, duration)
    ).to.be.revertedWith("Proof id already in use")
  })

  it("requires proofs with an agreed upon probability", async function () {
    const duration = 100_000
    await proofs.expectProofs(id, probability, duration)
    let amount = 0
    for (let i = 0; i < 100; i++) {
      if (await proofs.isProofRequired(id)) {
        amount += 1
      }
      await advanceTime(period)
    }
    let expected = 100 / probability ** 2
    expect(amount).to.be.closeTo(expected, expected / 2)
  })

  it("requires no proofs in the start period", async function () {
    const startPeriod = Math.floor((await currentTime()) / period)
    const probability = 1
    await proofs.expectProofs(id, probability, duration)
    while (Math.floor((await currentTime()) / period) == startPeriod) {
      expect(await proofs.isProofRequired(id)).to.be.false
      await advanceTime(1)
    }
  })

  it("requires no proofs in the end period", async function () {
    const probability = 1
    await proofs.expectProofs(id, probability, duration)
    await advanceTime(duration)
    expect(await proofs.isProofRequired(id)).to.be.false
  })

  it("requires no proofs after the end time", async function () {
    const probability = 1
    await proofs.expectProofs(id, probability, duration)
    await advanceTime(duration + timeout)
    expect(await proofs.isProofRequired(id)).to.be.false
  })

  it("requires proofs for different ids at different times", async function () {
    let id1 = ethers.utils.randomBytes(32)
    let id2 = ethers.utils.randomBytes(32)
    let id3 = ethers.utils.randomBytes(32)
    for (let id of [id1, id2, id3]) {
      await proofs.expectProofs(id, probability, duration)
    }
    let req1, req2, req3
    while (req1 === req2 && req2 === req3) {
      req1 = await proofs.isProofRequired(id1)
      req2 = await proofs.isProofRequired(id2)
      req3 = await proofs.isProofRequired(id3)
      await advanceTime(period)
    }
  })

  describe("when proofs are required", async function () {
    beforeEach(async function () {
      await proofs.expectProofs(id, probability, duration)
    })

    async function waitUntilProofIsRequired(id) {
      while (!(await proofs.isProofRequired(id))) {
        await advanceTime(period)
      }
    }

    function periodOf(timestamp) {
      return Math.floor(timestamp / period)
    }

    function periodStart(p) {
      return period * p
    }

    function periodEnd(p) {
      return periodStart(p + 1)
    }

    it("submits a correct proof", async function () {
      await proofs.submitProof(id, true)
    })

    it("fails proof submission when proof is incorrect", async function () {
      await expect(proofs.submitProof(id, false)).to.be.revertedWith(
        "Invalid proof"
      )
    })

    it("fails proof submission when already submitted", async function () {
      await advanceTimeTo(periodEnd(periodOf(await currentTime())))
      await proofs.submitProof(id, true)
      await expect(proofs.submitProof(id, true)).to.be.revertedWith(
        "Proof already submitted"
      )
    })

    it("marks a proof as missing", async function () {
      expect(await proofs.missed(id)).to.equal(0)
      await waitUntilProofIsRequired(id)
      let missedPeriod = periodOf(await currentTime())
      await advanceTimeTo(periodEnd(missedPeriod))
      await proofs.markProofAsMissing(id, missedPeriod)
      expect(await proofs.missed(id)).to.equal(1)
    })

    it("does not mark a proof as missing before period end", async function () {
      await waitUntilProofIsRequired(id)
      let currentPeriod = periodOf(await currentTime())
      await expect(
        proofs.markProofAsMissing(id, currentPeriod)
      ).to.be.revertedWith("Period has not ended yet")
    })

    it("does not mark a proof as missing after timeout", async function () {
      await waitUntilProofIsRequired(id)
      let currentPeriod = periodOf(await currentTime())
      await advanceTimeTo(periodEnd(currentPeriod) + timeout)
      await expect(
        proofs.markProofAsMissing(id, currentPeriod)
      ).to.be.revertedWith("Validation timed out")
    })

    it("does not mark a submitted proof as missing", async function () {
      await waitUntilProofIsRequired(id)
      let submittedPeriod = periodOf(await currentTime())
      await proofs.submitProof(id, true)
      await advanceTimeTo(periodEnd(submittedPeriod))
      await expect(
        proofs.markProofAsMissing(id, submittedPeriod)
      ).to.be.revertedWith("Proof was submitted, not missing")
    })

    it("does not mark proof as missing when not required", async function () {
      while (await proofs.isProofRequired(id)) {
        await advanceTime(period)
      }
      let currentPeriod = periodOf(await currentTime())
      await advanceTimeTo(periodEnd(currentPeriod))
      await expect(
        proofs.markProofAsMissing(id, currentPeriod)
      ).to.be.revertedWith("Proof was not required")
    })

    it("does not mark proof as missing twice", async function () {
      await waitUntilProofIsRequired(id)
      let missedPeriod = periodOf(await currentTime())
      await advanceTimeTo(periodEnd(missedPeriod))
      await proofs.markProofAsMissing(id, missedPeriod)
      await expect(
        proofs.markProofAsMissing(id, missedPeriod)
      ).to.be.revertedWith("Proof already marked as missing")
    })
  })
})
