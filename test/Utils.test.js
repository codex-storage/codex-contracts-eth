const { ethers } = require("hardhat")
const { expect } = require("chai")
const { hexlify, randomBytes } = ethers.utils
const { exampleAddress } = require("./examples")
const { hexZeroPad } = require("ethers/lib/utils")

describe("Utils", function () {
  let contract
  let value1
  let value2
  let value3
  let value4
  let value5
  let array

  describe("resize", function () {
    beforeEach(async function () {
      let Utils = await ethers.getContractFactory("TestUtils")
      contract = await Utils.deploy()
      value1 = hexlify(randomBytes(32))
      value2 = hexlify(randomBytes(32))
      value3 = hexlify(randomBytes(32))
      value4 = hexZeroPad(0, 32)
      value5 = hexZeroPad(0, 32)
      array = [value1, value2, value3, value4, value5]
    })

    it("resizes to zero length if new size is 0", async function () {
      await expect(await contract.resize(array, 0)).to.deep.equal([])
    })

    it("resizes to specified length", async function () {
      await expect(await contract.resize(array, 3)).to.deep.equal([
        value1,
        value2,
        value3,
      ])
    })

    it("fails to resize to out of bounds length", async function () {
      await expect(contract.resize(array, 6))
        .to.be.revertedWith("size out of bounds")
    })
  })
})
