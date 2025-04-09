const { expect } = require("chai")
const PeriodsModule = require("../ignition/modules/periods")

describe("Periods", function () {
  it("should revert when secondsPerPeriod is 0", async function () {
    const promise = ignition.deploy(PeriodsModule, {
      parameters: {
        Periods: {
          secondsPerPeriod: 0,
        },
      },
    })
    const expectedError = "Periods_InvalidSecondsPerPeriod"

    const error = await expect(promise).to.be.rejected
    expect(error)
      .to.have.property("message")
      .that.contains(
        expectedError,
        `Expected error ${expectedError}, but got ${error.message}`,
      )
  })

  it("should not revert when secondsPerPeriod more than 0", async function () {
    const promise = ignition.deploy(PeriodsModule, {
      parameters: {
        Periods: {
          secondsPerPeriod: 10,
        },
      },
    })

    await expect(promise).not.to.be.rejected
  })
})
