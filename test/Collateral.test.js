const { expect } = require("chai")
const { exampleLock } = require("./examples")

describe("Collateral", function () {
  let collateral, token
  let account0, account1

  beforeEach(async function () {
    let Collateral = await ethers.getContractFactory("TestCollateral")
    let TestToken = await ethers.getContractFactory("TestToken")
    token = await TestToken.deploy()
    collateral = await Collateral.deploy(token.address)
    ;[account0, account1] = await ethers.getSigners()
    await token.mint(account0.address, 1000)
    await token.mint(account1.address, 1000)
  })

  it("assigns zero collateral by default", async function () {
    expect(await collateral.balanceOf(account0.address)).to.equal(0)
    expect(await collateral.balanceOf(account1.address)).to.equal(0)
  })

  describe("depositing", function () {
    beforeEach(async function () {
      await token.connect(account0).approve(collateral.address, 100)
      await token.connect(account1).approve(collateral.address, 100)
    })

    it("updates the amount of collateral", async function () {
      await collateral.connect(account0).deposit(40)
      await collateral.connect(account1).deposit(2)
      expect(await collateral.balanceOf(account0.address)).to.equal(40)
      expect(await collateral.balanceOf(account1.address)).to.equal(2)
    })

    it("transfers tokens to the contract", async function () {
      let before = await token.balanceOf(collateral.address)
      await collateral.deposit(42)
      let after = await token.balanceOf(collateral.address)
      expect(after - before).to.equal(42)
    })

    it("fails when token transfer fails", async function () {
      let allowed = await token.allowance(account0.address, collateral.address)
      let invalidAmount = allowed.toNumber() + 1
      await expect(collateral.deposit(invalidAmount)).to.be.revertedWith(
        "ERC20: transfer amount exceeds allowance"
      )
    })
  })

  describe("withdrawing", function () {
    beforeEach(async function () {
      await token.connect(account0).approve(collateral.address, 100)
      await token.connect(account1).approve(collateral.address, 100)
      await collateral.connect(account0).deposit(40)
      await collateral.connect(account1).deposit(2)
    })

    it("updates the amount of collateral", async function () {
      await collateral.connect(account0).withdraw()
      expect(await collateral.balanceOf(account0.address)).to.equal(0)
      expect(await collateral.balanceOf(account1.address)).to.equal(2)
      await collateral.connect(account1).withdraw()
      expect(await collateral.balanceOf(account0.address)).to.equal(0)
      expect(await collateral.balanceOf(account1.address)).to.equal(0)
    })

    it("transfers balance to owner", async function () {
      let balance = await collateral.balanceOf(account0.address)
      let before = await token.balanceOf(account0.address)
      await collateral.withdraw()
      let after = await token.balanceOf(account0.address)
      expect(after - before).to.equal(balance)
    })
  })

  describe("slashing", function () {
    beforeEach(async function () {
      await token.connect(account0).approve(collateral.address, 1000)
      await token.connect(account1).approve(collateral.address, 1000)
      await collateral.connect(account0).deposit(1000)
      await collateral.connect(account1).deposit(1000)
    })

    it("reduces the amount of collateral by a percentage", async function () {
      await collateral.slash(account0.address, 10)
      await collateral.slash(account1.address, 5)
      expect(await collateral.balanceOf(account0.address)).to.equal(900)
      expect(await collateral.balanceOf(account1.address)).to.equal(950)
    })
  })

  describe("locking", function () {
    let lock

    beforeEach(async function () {
      await token.approve(collateral.address, 42)
      await collateral.deposit(42)
      lock = exampleLock()
      await collateral.createLock(lock.id, lock.expiry)
      await collateral.lock(account0.address, lock.id)
    })

    it("withdrawal fails when account is locked", async function () {
      await expect(collateral.withdraw()).to.be.revertedWith("Account locked")
    })

    it("withdrawal succeeds when account is unlocked", async function () {
      await collateral.unlock(lock.id)
      await expect(collateral.withdraw()).not.to.be.reverted
    })
  })
})
