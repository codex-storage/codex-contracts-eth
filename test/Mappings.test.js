const { ethers } = require("hardhat")
const { expect } = require("chai")
const { hexlify, randomBytes } = ethers.utils
const { exampleAddress } = require("./examples")

describe("Mappings", function () {
  let account
  let key
  let value
  let contract

  describe("Mapping", function () {
    beforeEach(async function () {
      let Mappings = await ethers.getContractFactory("TestMappings")
      contract = await Mappings.deploy()
      ;[account] = await ethers.getSigners()
      key = randomBytes(32)
      value = randomBytes(32)
    })

    it("starts empty", async function () {
      await expect(await contract.keyExists(key)).to.be.false
      await expect(await contract.valueExists(value)).to.be.false
      await expect(await contract.getKeyIds()).to.deep.equal([])
      await expect(await contract.getTotalValueCount()).to.equal(0)
    })

    it("adds a key and value", async function () {
      await expect(contract.insert(key, value))
        .to.emit(contract, "OperationResult")
        .withArgs(true)
      await expect(await contract.getValueIds(key)).to.deep.equal([
        hexlify(value),
      ])
    })

    it("removes a key", async function () {
      await contract.insertKey(key)
      await expect(contract.deleteKey(key))
        .to.emit(contract, "OperationResult")
        .withArgs(true)
      await expect(await contract.keyExists(key)).to.be.false
    })

    it("removes a value for key", async function () {
      let value1 = randomBytes(32)
      await contract.insert(key, value)
      await contract.insert(key, value1)
      await expect(contract.deleteValue(value))
        .to.emit(contract, "OperationResult")
        .withArgs(true)
      await expect(await contract.getKeyIds()).to.deep.equal([hexlify(key)])
      await expect(await contract.getValueIds(key)).to.deep.equal([
        hexlify(value1),
      ])
    })

    // referential integrity
    it("fails to insert a value when key does not exist", async function () {
      let key1 = randomBytes(32)
      await expect(contract.insertValue(key1, value)).to.be.revertedWith(
        "key does not exist"
      )
    })

    it("fails to get value ids when key does not exist", async function () {
      await expect(contract.getValueIds(key)).to.be.revertedWith(
        "key does not exist"
      )
    })

    it("fails to insert a value that already exists", async function () {
      await contract.insert(key, value)
      await expect(contract.insert(key, value))
        .to.emit(contract, "OperationResult")
        .withArgs(false)
      await expect(contract.insertValue(key, value)).to.be.revertedWith(
        "value already exists"
      )
    })

    it("fails to remove a key when it has values", async function () {
      let value1 = randomBytes(32)
      await contract.insert(key, value)
      await contract.insert(key, value1)
      await expect(contract.deleteKey(key)).to.be.revertedWith(
        "references values"
      )
    })

    // counts / existence
    it("reports correct counts and existence", async function () {
      let value1 = randomBytes(32)
      let value2 = randomBytes(32)
      let value3 = randomBytes(32)
      await contract.insert(key, value)
      await expect(await contract.keyExists(key)).to.be.true
      await expect(await contract.valueExists(value)).to.be.true
      await expect(await contract.valueExists(value1)).to.be.false
      await expect(await contract.getValueCount(key)).to.equal(1)
      await expect(await contract.getTotalValueCount()).to.equal(1)

      await contract.insert(key, value1)
      await expect(await contract.valueExists(value1)).to.be.true
      await expect(await contract.getValueCount(key)).to.equal(2)
      await expect(await contract.getTotalValueCount()).to.equal(2)

      await expect(contract.deleteValue(value1))
      await expect(await contract.keyExists(key)).to.be.true
      await expect(await contract.valueExists(value1)).to.be.false
      await expect(await contract.getValueCount(key)).to.equal(1)
      await expect(await contract.getTotalValueCount()).to.equal(1)

      await contract.insert(key, value1)
      await contract.insert(key, value2)
      await contract.insert(key, value3)
      await expect(contract.clearValues(key))
      await expect(await contract.keyExists(key)).to.be.false
      await expect(await contract.getKeyIds()).to.deep.equal([])

      // TODO: handle unreferenced values, as visible here. Once handled, this value should be 1
      await expect(await contract.getTotalValueCount()).to.equal(4)
      // await expect(await contract.valueExists(value)).to.be.false
      // await expect(await contract.valueExists(value1)).to.be.false
      // await expect(await contract.valueExists(value2)).to.be.false
      // await expect(await contract.valueExists(value3)).to.be.false
    })
  })
})
