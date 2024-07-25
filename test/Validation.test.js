const { expect } = require("chai")
const { ethers } = require("hardhat")
const {BigNumber, utils} = require("ethers")

describe("Validation", function () {
  const zero =
    "0x0000000000000000000000000000000000000000000000000000000000000000"
  const low =
    "0x0000000000000000000000000000000000000000000000000000000000000001"
  const mid =
    "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"

  describe("constructor", function() {
    // let validation
    let Validation

    beforeEach(async function () {
      Validation = await ethers.getContractFactory("TestValidation")
    })

    it("fails to deploy with > uint16.max validators", async function() {
      await expect(
        Validation.deploy({validators: 2**16}) // uint16.max is 2^16-1
      ).to.be.reverted
    })

    it("fails to deploy with 0 number of validators", async function() {
      await expect(
        Validation.deploy({validators: 0})
      ).to.be.revertedWith("validators must be > 0")
    })

    it("successfully deploys with a valid number of validators", async function() {
      await expect(
        Validation.deploy({validators: 1})
      ).to.be.ok
    })
  })

  describe("groups of SlotIds per validator", function() {

    let Validation

    const high = ethers.constants.MaxUint256

    function toUInt256Hex(bn) {
      return utils.hexZeroPad(bn.toHexString(), 32)
    }

    function random(max) {
      return Math.floor(Math.random() * max)
    }

    beforeEach(async function () {
      Validation = await ethers.getContractFactory("TestValidation")
    })

    it("tests that the min and max boundary SlotIds into the correct group", async function () {
      let validators = 2**16-1 // max value of uint16
      let idsPerGroup = high.div( validators ).add(1) // as in the contract
      let validation = await Validation.deploy({validators})

      // Returns the minimum SlotId of all allowed SlotIds of the validator
      // (given its index)
      function minIdFor(validatorIdx) {
        return BigNumber.from(validatorIdx).mul(idsPerGroup)
      }
      // Returns the maximum SlotId of all allowed SlotIds of the validator
      // (given its index)
      function maxIdFor(validatorIdx) {
        const max = BigNumber.from(validatorIdx + 1).mul(idsPerGroup).sub(1)
        // Never return more than max value of uint256 because it would
        // overflow. BigNumber.js lets us do MaxUint256+1 without overflows.
        if (max.gt(high)) {
          return high
        }
        return max
      }

      // Generate randomised number of validators. If we fuzzed all possible
      // number of validators, the test would take far too long to execute. This
      // should absolutely never fail.
      let validatorsRandomised = Array.from({ length: 128 }, (_) => random(validators))

      for(let i=0; i<validatorsRandomised.length; i++) {
        let validatorIdx = validatorsRandomised[i]

        // test the boundary of the SlotIds that are allowed in this particular
        // validator validatorIdx
        let min = toUInt256Hex( minIdFor(validatorIdx) )
        let max = toUInt256Hex( maxIdFor(validatorIdx) )

        try{
          expect(await validation.getValidatorIndex(min)).to.equal(validatorIdx)
          expect(await validation.getValidatorIndex(max)).to.equal(validatorIdx)
        } catch(e) {
          console.log('FAILING TEST PARAMETERS')
          console.log('-----------------------------------------------------------------------------------')
          console.log('validator index:', validatorIdx)
          console.log('slotId min:     ', min)
          console.log('slotId max:     ', max)
          throw e
        }
      }
    })
  })
})
