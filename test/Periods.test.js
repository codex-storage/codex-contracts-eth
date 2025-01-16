const { expect } = require("chai")
const { ethers } = require("hardhat")

describe("Periods", function () {
  it("should revert when secondsPerPeriod is 0", async function () {
    const PeriodsContract = await ethers.getContractFactory("Periods")
    await expect(PeriodsContract.deploy(0)).to.be.revertedWith(
      "Periods_InvalidSecondsPerPeriod"
    )
  })

  it("should not revert when secondsPerPeriod more than 0", async function () {
    const PeriodsContract = await ethers.getContractFactory("Periods")
    await expect(PeriodsContract.deploy(10)).not.to.be.reverted
  })
})
