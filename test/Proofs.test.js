const { expect } = require("chai")
const { ethers } = require("hardhat")
const { hexlify, randomBytes } = ethers.utils
const {
  snapshot,
  revert,
  mine,
  ensureMinimumBlockHeight,
  currentTime,
  advanceTime,
  advanceTimeTo,
} = require("./evm")
const { periodic, hours, now, minutes } = require("./time")

describe("Proofs", function () {
  const id = hexlify(randomBytes(32))
  const endId = hexlify(randomBytes(32))
  const period = 30 * 60
  const timeout = 5
  const downtime = 64
  const duration = 1000 * period
  const probability = 4 // require a proof roughly once every 4 periods
  const { periodOf, periodEnd } = periodic(period)

  let proofs

  beforeEach(async function () {
    await snapshot()
    await ensureMinimumBlockHeight(256)
    const Proofs = await ethers.getContractFactory("TestProofs")
    proofs = await Proofs.deploy(period, timeout, downtime)
  })

  afterEach(async function () {
    await revert()
  })

  it("calculates an end time based on duration", async function () {
    await proofs.expectProofs(id, endId, probability, duration)
    let end = (await currentTime()) + duration
    expect((await proofs.end(endId)).toNumber()).to.be.closeTo(end, 1)
  })

  it("does not allow ids to be reused", async function () {
    await proofs.expectProofs(id, endId, probability, duration)
    await expect(
      proofs.expectProofs(id, endId, probability, duration)
    ).to.be.revertedWith("Proof id already in use")
  })

  it("requires proofs with an agreed upon probability", async function () {
    await proofs.expectProofs(id, endId, probability, duration)
    let amount = 0
    for (let i = 0; i < 100; i++) {
      if (await proofs.isProofRequired(id)) {
        amount += 1
      }
      await advanceTime(period)
    }
    let expected = 100 / probability
    expect(amount).to.be.closeTo(expected, expected / 2)
  })

  it("requires no proofs in the start period", async function () {
    const startPeriod = Math.floor((await currentTime()) / period)
    const probability = 1
    await proofs.expectProofs(id, endId, probability, duration)
    while (Math.floor((await currentTime()) / period) == startPeriod) {
      expect(await proofs.isProofRequired(id)).to.be.false
      await advanceTime(Math.floor(period / 10))
    }
  })

  it("requires no proofs in the end period", async function () {
    const probability = 1
    await proofs.expectProofs(id, endId, probability, duration)
    await advanceTime(duration)
    expect(await proofs.isProofRequired(id)).to.be.false
  })

  it("requires no proofs after the end time", async function () {
    const probability = 1
    await proofs.expectProofs(id, endId, probability, duration)
    await advanceTime(duration + timeout)
    expect(await proofs.isProofRequired(id)).to.be.false
  })

  it("requires proofs for different ids at different times", async function () {
    let id1 = hexlify(randomBytes(32))
    let id2 = hexlify(randomBytes(32))
    let id3 = hexlify(randomBytes(32))
    for (let id of [id1, id2, id3]) {
      await proofs.expectProofs(id, endId, probability, duration)
    }
    let req1, req2, req3
    while (req1 === req2 && req2 === req3) {
      req1 = await proofs.isProofRequired(id1)
      req2 = await proofs.isProofRequired(id2)
      req3 = await proofs.isProofRequired(id3)
      await advanceTime(period)
    }
  })

  it("moves pointer one block at a time", async function () {
    await advanceTimeTo(periodEnd(periodOf(await currentTime())))
    for (let i = 0; i < 256; i++) {
      let previous = await proofs.getPointer(id)
      await mine()
      let current = await proofs.getPointer(id)
      expect(current).to.equal((previous + 1) % 256)
    }
  })

  describe("when proof requirement is upcoming", function () {
    async function waitUntilProofWillBeRequired() {
      while (!(await proofs.willProofBeRequired(id))) {
        await mine()
      }
    }

    beforeEach(async function () {
      await proofs.expectProofs(id, endId, probability, duration)
      await advanceTimeTo(periodEnd(periodOf(await currentTime())))
      await waitUntilProofWillBeRequired()
    })

    it("means the pointer is in downtime", async function () {
      expect(await proofs.getPointer(id)).to.be.lt(downtime)
      while ((await proofs.getPointer(id)) < downtime) {
        expect(await proofs.willProofBeRequired(id)).to.be.true
        await mine()
      }
    })

    it("means that a proof is required after downtime", async function () {
      while ((await proofs.getPointer(id)) < downtime) {
        await mine()
      }
      expect(await proofs.willProofBeRequired(id)).to.be.false
      expect(await proofs.isProofRequired(id)).to.be.true
    })

    it("will not require proofs when no longer expected", async function () {
      expect(await proofs.getPointer(id)).to.be.lt(downtime)
      expect(await proofs.willProofBeRequired(id)).to.be.true
      await proofs.unexpectProofs(id)
      expect(await proofs.willProofBeRequired(id)).to.be.false
    })
  })

  describe("when proofs are required", function () {
    const proof = hexlify(randomBytes(42))

    beforeEach(async function () {
      await proofs.expectProofs(id, endId, probability, duration)
    })

    async function waitUntilProofIsRequired(id) {
      await advanceTimeTo(periodEnd(periodOf(await currentTime())))
      while (
        !(
          (await proofs.isProofRequired(id)) &&
          (await proofs.getPointer(id)) < 250
        )
      ) {
        await advanceTime(period)
      }
    }

    it("provides different challenges per period", async function () {
      await waitUntilProofIsRequired(id)
      const challenge1 = await proofs.getChallenge(id)
      await waitUntilProofIsRequired(id)
      const challenge2 = await proofs.getChallenge(id)
      expect(challenge2).not.to.equal(challenge1)
    })

    it("provides different challenges per id", async function () {
      const id2 = hexlify(randomBytes(32))
      const id3 = hexlify(randomBytes(32))
      const challenge1 = await proofs.getChallenge(id)
      const challenge2 = await proofs.getChallenge(id2)
      const challenge3 = await proofs.getChallenge(id3)
      expect(challenge1 === challenge2 && challenge2 === challenge3).to.be.false
    })

    it("submits a correct proof", async function () {
      await proofs.submitProof(id, proof)
    })

    it("fails proof submission when proof is incorrect", async function () {
      await expect(proofs.submitProof(id, [])).to.be.revertedWith(
        "Invalid proof"
      )
    })

    it("emits an event when proof was submitted", async function () {
      await expect(proofs.submitProof(id, proof))
        .to.emit(proofs, "ProofSubmitted")
        .withArgs(id, proof)
    })

    it("fails proof submission when already submitted", async function () {
      await advanceTimeTo(periodEnd(periodOf(await currentTime())))
      await proofs.submitProof(id, proof)
      await expect(proofs.submitProof(id, proof)).to.be.revertedWith(
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
      await proofs.submitProof(id, proof)
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

    it("requires no proofs when no longer expected", async function () {
      await waitUntilProofIsRequired(id)
      await proofs.unexpectProofs(id)
      await expect(await proofs.isProofRequired(id)).to.be.false
    })
  })

  describe("extend proof end", function () {
    const proof = hexlify(randomBytes(42))

    beforeEach(async function () {
      await proofs.expectProofs(id, endId, probability, duration)
    })

    async function waitUntilProofIsRequired(id) {
      await advanceTimeTo(periodEnd(periodOf(await currentTime())))
      while (
        !(
          (await proofs.isProofRequired(id)) &&
          (await proofs.getPointer(id)) < 250
        )
      ) {
        await advanceTime(period)
      }
    }

    async function isProofRequiredBefore(id, ending) {
      let start = periodOf(await currentTime())
      let end = periodOf(ending)
      let periods = end - start
      await advanceTimeTo(periodEnd(periodOf(await currentTime())))
      for (let i = 0; i < periods; i++) {
        if (await proofs.isProofRequired(id)) {
          return true
        }
        await advanceTime(period)
      }
      return false
    }

    it("can't extend if proof doesn't exist", async function () {
      let ending = (await currentTime()) + duration
      const otherId = hexlify(randomBytes(32))
      await expect(
        proofs.extendProofEndTo(otherId, ending + 1)
      ).to.be.revertedWith("endId for given id doesn't exist")
    })

    it("can't extend already lapsed proof ending", async function () {
      let ending = (await currentTime()) + duration
      await waitUntilProofIsRequired(id)
      await advanceTimeTo(ending + 1)
      await expect(proofs.extendProofEndTo(id, ending + 1)).to.be.revertedWith(
        "Proof already ended"
      )
    })

    it("requires no proofs when ending has not been extended", async function () {
      let ending = (await currentTime()) + duration
      await expect(await isProofRequiredBefore(id, ending)).to.be.true
      let endingExtended = ending + hours(1)
      await advanceTimeTo(periodEnd(periodOf(endingExtended) + 1))
      await expect(await isProofRequiredBefore(id, endingExtended)).to.be.false
    })

    it("requires proofs when ending has been extended", async function () {
      let ending = (await currentTime()) + duration
      await expect(await isProofRequiredBefore(id, ending)).to.be.true
      let endingExtended = ending + hours(1)
      await proofs.extendProofEndTo(id, endingExtended)
      await expect(await isProofRequiredBefore(id, endingExtended)).to.be.true
    })

    it("no longer requires proofs after extension lapsed", async function () {
      async function expectNoProofsForPeriods(id, periods) {
        await advanceTimeTo(periodEnd(periodOf(await currentTime())))
        for (let i = 0; i < periods; i++) {
          await expect(await proofs.isProofRequired(id)).to.be.false
          await advanceTime(period)
        }
      }

      let ending = (await currentTime()) + duration
      let endingExtended = ending + hours(1)
      await proofs.extendProofEndTo(id, endingExtended)
      await advanceTimeTo(periodEnd(periodOf(endingExtended) + 1))
      await expectNoProofsForPeriods(id, 100)
    })
  })
})
