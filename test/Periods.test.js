const { expect } = require("chai")
const PeriodsModule = require("../ignition/modules/periods")
const { assertDeploymentRejectedWithCustomError } = require("./helpers")

describe("Periods", function () {
  it("should revert when secondsPerPeriod is 0", async function () {
    const promise = ignition.deploy(PeriodsModule, {
      parameters: {
        Periods: {
          secondsPerPeriod: 0,
        },
      },
    })

    assertDeploymentRejectedWithCustomError(
      "Periods_InvalidSecondsPerPeriod",
      promise,
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
