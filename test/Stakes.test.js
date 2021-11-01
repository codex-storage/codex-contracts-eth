const { expect } = require("chai")
const { ethers } = require("hardhat")

describe("Stakes", function () {

  var stakes
  var token
  var host

  beforeEach(async function() {
    [host] = await ethers.getSigners()
    const Stakes = await ethers.getContractFactory("TestStakes")
    const TestToken = await ethers.getContractFactory("TestToken")
    token = await TestToken.deploy()
    stakes = await Stakes.deploy(token.address)
  })

  it("has zero stakes initially", async function () {
    const address = await host.getAddress()
    const stake = await stakes.stake(address)
    expect(stake).to.equal(0)
  })

  it("increases stakes by transferring tokens", async function () {
    await token.approve(stakes.address, 20)
    await stakes.increaseStake(20)
    let stake = await stakes.stake(host.address)
    expect(stake).to.equal(20)
  })

  it("does not increase stake when token transfer fails", async function () {
    await expect(
      stakes.increaseStake(20)
    ).to.be.revertedWith("ERC20: transfer amount exceeds allowance")
  })

  it("allows withdrawal of stake", async function () {
    await token.approve(stakes.address, 20)
    await stakes.increaseStake(20)
    let balanceBefore = await token.balanceOf(host.address)
    await stakes.withdrawStake()
    let balanceAfter = await token.balanceOf(host.address)
    expect(balanceAfter - balanceBefore).to.equal(20)
  })

  it("locks stake", async function () {
    await token.approve(stakes.address, 20)
    await stakes.increaseStake(20)
    await stakes.lockStake(host.address)
    await expect(stakes.withdrawStake()).to.be.revertedWith("Stake locked")
    await stakes.unlockStake(host.address)
    await expect(stakes.withdrawStake()).not.to.be.reverted
  })

  it("fails to unlock when already unlocked", async function () {
    await expect(
      stakes.unlockStake(host.address)
    ).to.be.revertedWith("Stake already unlocked")
  })

  it("requires an equal amount of locks and unlocks", async function () {
    await token.approve(stakes.address, 20)
    await stakes.increaseStake(20)
    await stakes.lockStake(host.address)
    await stakes.lockStake(host.address)
    await stakes.unlockStake(host.address)
    await expect(stakes.withdrawStake()).to.be.revertedWith("Stake locked")
    await stakes.unlockStake(host.address)
    await expect(stakes.withdrawStake()).not.to.be.reverted
  })
})
