const { ethers } = require("hardhat")
const { expect } = require("chai")
const { hexlify, randomBytes } = ethers.utils
const { exampleAddress } = require("./examples")

describe("SetMap", function () {
  let account
  let key
  let value
  let contract

  describe("Bytes32SetMap", function () {
    beforeEach(async function () {
      let Bytes32SetMap = await ethers.getContractFactory("TestBytes32SetMap")
      contract = await Bytes32SetMap.deploy()
      ;[account] = await ethers.getSigners()
      key = randomBytes(32)
      value = randomBytes(32)
    })

    it("starts empty", async function () {
      await expect(await contract.values(key, account.address)).to.deep.equal(
        []
      )
    })

    it("adds a key/address and value", async function () {
      await expect(contract.add(key, account.address, value))
        .to.emit(contract, "OperationResult")
        .withArgs(true)
      await expect(await contract.values(key, account.address)).to.deep.equal([
        hexlify(value),
      ])
    })

    it("removes a value for key/address", async function () {
      let value1 = randomBytes(32)
      await contract.add(key, account.address, value)
      await contract.add(key, account.address, value1)
      await expect(contract.remove(key, account.address, value))
        .to.emit(contract, "OperationResult")
        .withArgs(true)
      await expect(await contract.values(key, account.address)).to.deep.equal([
        hexlify(value1),
      ])
    })

    it("clears all values for a key", async function () {
      let key1 = randomBytes(32)
      let value1 = randomBytes(32)
      let value2 = randomBytes(32)
      await contract.add(key, account.address, value)
      await contract.add(key, account.address, value1)
      await contract.add(key, account.address, value2)
      await contract.add(key1, account.address, value)
      await expect(contract.clear(key))
      await expect(await contract.values(key, account.address)).to.deep.equal(
        []
      )
      await expect(await contract.values(key1, account.address)).to.deep.equal([
        hexlify(value),
      ])
    })

    it("gets the length of values for a key/address", async function () {
      let value1 = randomBytes(32)
      let value2 = randomBytes(32)
      await contract.add(key, account.address, value)
      await contract.add(key, account.address, value1)
      await contract.add(key, account.address, value2)
      await expect(await contract.length(key, account.address)).to.equal(3)
    })
  })

  describe("AddressBytes32SetMap", function () {
    beforeEach(async function () {
      let AddressBytes32SetMap = await ethers.getContractFactory(
        "TestAddressBytes32SetMap"
      )
      contract = await AddressBytes32SetMap.deploy()
      ;[account, account1] = await ethers.getSigners()
      key = account.address
      value = randomBytes(32)
    })

    it("starts empty", async function () {
      await expect(await contract.values(key)).to.deep.equal([])
    })

    it("adds a key/address and value", async function () {
      await expect(contract.add(key, value))
        .to.emit(contract, "OperationResult")
        .withArgs(true)
      await expect(await contract.values(key)).to.deep.equal([hexlify(value)])
    })

    it("removes a value for key/address", async function () {
      let value1 = randomBytes(32)
      await contract.add(key, value)
      await contract.add(key, value1)
      await expect(contract.remove(key, value))
        .to.emit(contract, "OperationResult")
        .withArgs(true)
      await expect(await contract.values(key)).to.deep.equal([hexlify(value1)])
    })

    it("clears all values for a key", async function () {
      let key1 = account1.address
      let value1 = randomBytes(32)
      let value2 = randomBytes(32)
      await contract.add(key, value)
      await contract.add(key, value1)
      await contract.add(key, value2)
      await contract.add(key1, value)
      await expect(contract.clear(key))
      await expect(await contract.values(key)).to.deep.equal([])
      await expect(await contract.values(key1)).to.deep.equal([hexlify(value)])
    })
  })

  describe("Bytes32AddressSetMap", function () {
    beforeEach(async function () {
      let Bytes32AddressSetMap = await ethers.getContractFactory(
        "TestBytes32AddressSetMap"
      )
      contract = await Bytes32AddressSetMap.deploy()
      ;[account] = await ethers.getSigners()
      key = randomBytes(32)
      value = exampleAddress()
    })

    it("starts empty", async function () {
      await expect(await contract.values(key)).to.deep.equal([])
    })

    it("adds a key/address and value", async function () {
      await expect(contract.add(key, value))
        .to.emit(contract, "OperationResult")
        .withArgs(true)
      await expect(await contract.values(key)).to.deep.equal([value])
    })

    it("returns list of keys", async function () {
      let key1 = randomBytes(32)
      let value1 = exampleAddress()
      await contract.add(key, value)
      await contract.add(key, value1)
      await contract.add(key1, value)
      await contract.add(key1, value1)
      await expect(await contract.keys()).to.deep.equal([
        hexlify(key),
        hexlify(key1),
      ])
      await contract.remove(key1, value)
      await expect(await contract.keys()).to.deep.equal([
        hexlify(key),
        hexlify(key1),
      ])
      await contract.remove(key1, value1)
      await expect(await contract.keys()).to.deep.equal([hexlify(key)])
      await contract.clear(key)
      await expect(await contract.keys()).to.deep.equal([])
    })

    it("contains a key/value pair", async function () {
      let key1 = randomBytes(32)
      let value1 = exampleAddress()
      await contract.add(key, value)
      await contract.add(key1, value1)
      await expect(await contract.contains(key, value)).to.equal(true)
      await expect(await contract.contains(key1, value1)).to.equal(true)
      await expect(await contract.contains(key1, value)).to.equal(false)
    })

    it("removes a value for key/address", async function () {
      let value1 = exampleAddress()
      await contract.add(key, value)
      await contract.add(key, value1)
      await expect(contract.remove(key, value))
        .to.emit(contract, "OperationResult")
        .withArgs(true)
      await expect(await contract.values(key)).to.deep.equal([value1])
    })

    it("clears all values for a key", async function () {
      let key1 = randomBytes(32)
      let value1 = exampleAddress()
      let value2 = exampleAddress()
      await contract.add(key, value)
      await contract.add(key, value1)
      await contract.add(key, value2)
      await contract.add(key1, value)
      await expect(contract.clear(key))
      await expect(await contract.values(key)).to.deep.equal([])
      await expect(await contract.values(key1)).to.deep.equal([value])
    })

    it("gets the length of values for a key/address", async function () {
      let value1 = exampleAddress()
      let value2 = exampleAddress()
      await contract.add(key, value)
      await contract.add(key, value1)
      await contract.add(key, value2)
      await expect(await contract.length(key)).to.equal(3)
    })
  })
})
