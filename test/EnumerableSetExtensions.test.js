const { ethers } = require("hardhat")
const { expect } = require("chai")
const { hexlify, randomBytes } = ethers.utils
const { exampleAddress } = require("./examples")

describe("EnumerableSetExtensions", function () {
  let account
  let key
  let value
  let contract

  describe("ClearableBytes32Set", function () {
    beforeEach(async function () {
      let ClearableBytes32Set = await ethers.getContractFactory(
        "TestClearableBytes32Set"
      )
      contract = await ClearableBytes32Set.deploy()
      ;[account] = await ethers.getSigners()
      value = randomBytes(32)
    })

    it("starts empty", async function () {
      await expect(await contract.values()).to.deep.equal([])
    })

    it("adds a value", async function () {
      await expect(contract.add(value))
        .to.emit(contract, "OperationResult")
        .withArgs(true)
      await expect(await contract.values()).to.deep.equal([hexlify(value)])
    })

    it("adds a value that already exists", async function () {
      await contract.add(value)
      await expect(contract.add(value))
        .to.emit(contract, "OperationResult")
        .withArgs(false)
      await expect(await contract.values()).to.deep.equal([hexlify(value)])
    })

    it("contains a value", async function () {
      let key1 = randomBytes(32)
      let value1 = randomBytes(32)
      await contract.add(value)
      await contract.add(value1)
      await expect(await contract.contains(value)).to.equal(true)
      await expect(await contract.contains(value1)).to.equal(true)
    })

    it("removes a value", async function () {
      let value1 = randomBytes(32)
      await contract.add(value)
      await contract.add(value1)
      await expect(contract.remove(value))
        .to.emit(contract, "OperationResult")
        .withArgs(true)
      await expect(await contract.values()).to.deep.equal([hexlify(value1)])
    })

    it("removes a value that doesn't exist", async function () {
      let value1 = randomBytes(32)
      await contract.add(value)
      await contract.add(value1)
      await contract.remove(value)
      await expect(contract.remove(value))
        .to.emit(contract, "OperationResult")
        .withArgs(false)
      await expect(await contract.values()).to.deep.equal([hexlify(value1)])
    })

    it("clears all values", async function () {
      let value1 = randomBytes(32)
      let value2 = randomBytes(32)
      await contract.add(value)
      await contract.add(value1)
      await contract.add(value2)
      await expect(contract.clear())
      await expect(await contract.values()).to.deep.equal([])
    })

    it("gets the length of values", async function () {
      let value1 = randomBytes(32)
      let value2 = randomBytes(32)
      await contract.add(value)
      await contract.add(value1)
      await contract.add(value2)
      await expect(await contract.length()).to.equal(3)
    })
  })
})
