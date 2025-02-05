const { expect } = require("chai")
const { ethers } = require("hardhat")
const { randomBytes } = ethers.utils
const {
  currentTime,
  advanceTimeTo,
  mine,
  setAutomine,
  setNextBlockTimestamp,
  snapshot,
  revert,
} = require("./evm")

describe("Vault", function () {
  const fund = randomBytes(32)

  let token
  let vault
  let controller
  let account, account2, account3

  beforeEach(async function () {
    await snapshot()
    const TestToken = await ethers.getContractFactory("TestToken")
    token = await TestToken.deploy()
    const Vault = await ethers.getContractFactory("Vault")
    vault = await Vault.deploy(token.address)
    ;[controller, account, account2, account3] = await ethers.getSigners()
    await token.mint(account.address, 1_000_000)
    await token.mint(account2.address, 1_000_000)
    await token.mint(account3.address, 1_000_000)
  })

  afterEach(async function () {
    await revert()
  })

  describe("when a fund has no lock set", function () {
    it("allows a lock to be set", async function () {
      expiry = (await currentTime()) + 80
      maximum = (await currentTime()) + 100
      await vault.lock(fund, expiry, maximum)
      expect((await vault.getLock(fund))[0]).to.equal(expiry)
      expect((await vault.getLock(fund))[1]).to.equal(maximum)
    })

    it("does not allow a lock with expiry past maximum", async function () {
      let maximum = (await currentTime()) + 100
      const locking = vault.lock(fund, maximum + 1, maximum)
      await expect(locking).to.be.revertedWith("ExpiryPastMaximum")
    })

    it("does not allow extending of lock", async function () {
      await expect(
        vault.extendLock(fund, (await currentTime()) + 1)
      ).to.be.revertedWith("LockRequired")
    })

    it("does not allow depositing of tokens", async function () {
      const amount = 1000
      await token.connect(account).approve(vault.address, amount)
      await expect(
        vault.deposit(fund, account.address, amount)
      ).to.be.revertedWith("LockRequired")
    })

    it("does not have any balance", async function() {
      const balance = await vault.getBalance(fund, account.address)
      const designated = await vault.getDesignatedBalance(fund, account.address)
      expect(balance).to.equal(0)
      expect(designated).to.equal(0)
    })

    it("does not allow designating tokens", async function () {
      await expect(
        vault.designate(fund, account.address, 0)
      ).to.be.revertedWith("LockRequired")
    })

    it("does not allow transfer of tokens", async function () {
      await expect(
        vault.transfer(fund, account.address, account2.address, 0)
      ).to.be.revertedWith("LockRequired")
    })

    it("does not allow flowing of tokens", async function () {
      await expect(
        vault.flow(fund, account.address, account2.address, 0)
      ).to.be.revertedWith("LockRequired")
    })

    it("does not allow burning of tokens", async function () {
      await expect(vault.burn(fund, account.address)).to.be.revertedWith(
        "LockRequired"
      )
    })
  })

  describe("when a fund is locked", function () {
    let expiry
    let maximum

    beforeEach(async function () {
      const beginning = (await currentTime()) + 10
      expiry = beginning + 80
      maximum = beginning + 100
      await setAutomine(false)
      await setNextBlockTimestamp(beginning)
      await vault.lock(fund, expiry, maximum)
    })

    describe("locking", function () {
      beforeEach(async function () {
        await setAutomine(true)
      })

      it("cannot set lock when already locked", async function () {
        await expect(vault.lock(fund, expiry, maximum)).to.be.revertedWith(
          "AlreadyLocked"
        )
      })

      it("can extend a lock expiry up to its maximum", async function () {
        await vault.extendLock(fund, expiry + 1)
        expect((await vault.getLock(fund))[0]).to.equal(expiry + 1)
        await vault.extendLock(fund, maximum)
        expect((await vault.getLock(fund))[0]).to.equal(maximum)
      })

      it("cannot extend a lock past its maximum", async function () {
        const extending = vault.extendLock(fund, maximum + 1)
        await expect(extending).to.be.revertedWith("ExpiryPastMaximum")
      })

      it("cannot move expiry forward", async function () {
        const extending = vault.extendLock(fund, expiry - 1)
        await expect(extending).to.be.revertedWith("InvalidExpiry")
      })

      it("does not delete lock when no tokens remain", async function () {
        await token.connect(account).approve(vault.address, 30)
        await vault.deposit(fund, account.address, 30)
        await vault.burn(fund, account.address)
        expect((await vault.getLock(fund))[0]).to.not.equal(0)
        expect((await vault.getLock(fund))[1]).to.not.equal(0)
      })
    })

    describe("depositing", function () {
      const amount = 1000

      beforeEach(async function () {
        await setAutomine(true)
      })

      it("accepts deposits of tokens", async function () {
        await token.connect(account).approve(vault.address, amount)
        await vault.deposit(fund, account.address, amount)
        const balance = await vault.getBalance(fund, account.address)
        expect(balance).to.equal(amount)
      })

      it("keeps custody of tokens that are deposited", async function () {
        await token.connect(account).approve(vault.address, amount)
        await vault.deposit(fund, account.address, amount)
        expect(await token.balanceOf(vault.address)).to.equal(amount)
      })

      it("deposit fails when tokens cannot be transferred", async function () {
        await token.connect(account).approve(vault.address, amount - 1)
        const depositing = vault.deposit(fund, account.address, amount)
        await expect(depositing).to.be.revertedWith("insufficient allowance")
      })

      it("adds multiple deposits to the balance", async function () {
        await token.connect(account).approve(vault.address, amount)
        await vault.deposit(fund, account.address, amount / 2)
        await vault.deposit(fund, account.address, amount / 2)
        const balance = await vault.getBalance(fund, account.address)
        expect(balance).to.equal(amount)
      })

      it("separates deposits from different funds", async function () {
        const fund1 = randomBytes(32)
        const fund2 = randomBytes(32)
        await vault.lock(fund1, expiry, maximum)
        await vault.lock(fund2, expiry, maximum)
        await token.connect(account).approve(vault.address, 3)
        await vault.deposit(fund1, account.address, 1)
        await vault.deposit(fund2, account.address, 2)
        expect(await vault.getBalance(fund1, account.address)).to.equal(1)
        expect(await vault.getBalance(fund2, account.address)).to.equal(2)
      })

      it("separates deposits from different controllers", async function () {
        const [, , controller1, controller2] = await ethers.getSigners()
        const vault1 = vault.connect(controller1)
        const vault2 = vault.connect(controller2)
        await vault1.lock(fund, expiry, maximum)
        await vault2.lock(fund, expiry, maximum)
        await token.connect(account).approve(vault.address, 3)
        await vault1.deposit(fund, account.address, 1)
        await vault2.deposit(fund, account.address, 2)
        expect(await vault1.getBalance(fund, account.address)).to.equal(1)
        expect(await vault2.getBalance(fund, account.address)).to.equal(2)
      })
    })

    describe("designating", function () {
      const amount = 1000

      beforeEach(async function () {
        await token.connect(account).approve(vault.address, amount)
        await vault.deposit(fund, account.address, amount)
      })

      it("can designate tokens for a single recipient", async function () {
        await setAutomine(true)
        await vault.designate(fund, account.address, amount)
        expect(
          await vault.getDesignatedBalance(fund, account.address)
        ).to.equal(amount)
      })

      it("can designate part of the balance", async function () {
        await setAutomine(true)
        await vault.designate(fund, account.address, 10)
        expect(
          await vault.getDesignatedBalance(fund, account.address)
        ).to.equal(10)
      })

      it("adds up designated tokens", async function () {
        await setAutomine(true)
        await vault.designate(fund, account.address, 10)
        await vault.designate(fund, account.address, 10)
        expect(
          await vault.getDesignatedBalance(fund, account.address)
        ).to.equal(20)
      })

      it("does not change the balance", async function () {
        await setAutomine(true)
        await vault.designate(fund, account.address, 10)
        expect(await vault.getBalance(fund, account.address)).to.equal(amount)
      })

      it("cannot designate more than the undesignated balance", async function () {
        await setAutomine(true)
        await vault.designate(fund, account.address, amount)
        await expect(
          vault.designate(fund, account.address, 1)
        ).to.be.revertedWith("InsufficientBalance")
      })

      it("cannot designate tokens that are flowing", async function () {
        await vault.flow(fund, account.address, account2.address, 5)
        setAutomine(true)
        await vault.designate(fund, account.address, 500)
        const designating = vault.designate(fund, account.address, 1)
        await expect(designating).to.be.revertedWith("InsufficientBalance")
      })
    })

    describe("transfering", function () {
      const amount = 1000

      let address1
      let address2
      let address3

      beforeEach(async function () {
        await token.connect(account).approve(vault.address, amount)
        await vault.deposit(fund, account.address, amount)
        address1 = account.address
        address2 = account2.address
        address3 = account3.address
      })

      it("can transfer tokens from one recipient to the other", async function () {
        await setAutomine(true)
        await vault.transfer(fund, address1, address2, amount)
        expect(await vault.getBalance(fund, address1)).to.equal(0)
        expect(await vault.getBalance(fund, address2)).to.equal(amount)
      })

      it("can transfer part of a balance", async function () {
        await setAutomine(true)
        await vault.transfer(fund, address1, address2, 10)
        expect(await vault.getBalance(fund, address1)).to.equal(amount - 10)
        expect(await vault.getBalance(fund, address2)).to.equal(10)
      })

      it("can transfer out funds that were transfered in", async function () {
        await setAutomine(true)
        await vault.transfer(fund, address1, address2, amount)
        await vault.transfer(fund, address2, address3, amount)
        expect(await vault.getBalance(fund, address2)).to.equal(0)
        expect(await vault.getBalance(fund, address3)).to.equal(amount)
      })

      it("can transfer to self", async function () {
        await setAutomine(true)
        await vault.transfer(fund, address1, address1, amount)
        expect(await vault.getBalance(fund, address1)).to.equal(amount)
      })

      it("does not transfer more than the balance", async function () {
        await setAutomine(true)
        await expect(
          vault.transfer(fund, address1, address2, amount + 1)
        ).to.be.revertedWith("InsufficientBalance")
      })

      it("does not transfer designated tokens", async function () {
        await setAutomine(true)
        await vault.designate(fund, account.address, 1)
        await expect(
          vault.transfer(fund, account.address, account2.address, amount)
        ).to.be.revertedWith("InsufficientBalance")
      })

      it("does not transfer tokens that are flowing", async function () {
        await vault.flow(fund, address1, address2, 5)
        setAutomine(true)
        await vault.transfer(fund, address1, address2, 500)
        await expect(
          vault.transfer(fund, address1, address2, 1)
        ).to.be.revertedWith("InsufficientBalance")
      })
    })

    describe("flowing", function () {
      const deposit = 1000

      let address1
      let address2
      let address3

      beforeEach(async function () {
        await token.connect(account).approve(vault.address, deposit)
        await vault.deposit(fund, account.address, deposit)
        address1 = account.address
        address2 = account2.address
        address3 = account3.address
      })

      async function getBalance(recipient) {
        return await vault.getBalance(fund, recipient)
      }

      it("moves tokens over time", async function () {
        await vault.flow(fund, address1, address2, 2)
        mine()
        const start = await currentTime()
        await advanceTimeTo(start + 2)
        expect(await getBalance(address1)).to.equal(deposit - 4)
        expect(await getBalance(address2)).to.equal(4)
        await advanceTimeTo(start + 4)
        expect(await getBalance(address1)).to.equal(deposit - 8)
        expect(await getBalance(address2)).to.equal(8)
      })

      it("can move tokens to several different recipients", async function () {
        await vault.flow(fund, address1, address2, 1)
        await vault.flow(fund, address1, address3, 2)
        await mine()
        const start = await currentTime()
        await advanceTimeTo(start + 2)
        expect(await getBalance(address1)).to.equal(deposit - 6)
        expect(await getBalance(address2)).to.equal(2)
        expect(await getBalance(address3)).to.equal(4)
        await advanceTimeTo(start + 4)
        expect(await getBalance(address1)).to.equal(deposit - 12)
        expect(await getBalance(address2)).to.equal(4)
        expect(await getBalance(address3)).to.equal(8)
      })

      it("allows flows to be diverted to other recipient", async function () {
        await vault.flow(fund, address1, address2, 3)
        await vault.flow(fund, address2, address3, 1)
        await mine()
        const start = await currentTime()
        await advanceTimeTo(start + 2)
        expect(await getBalance(address1)).to.equal(deposit - 6)
        expect(await getBalance(address2)).to.equal(4)
        expect(await getBalance(address3)).to.equal(2)
        await advanceTimeTo(start + 4)
        expect(await getBalance(address1)).to.equal(deposit - 12)
        expect(await getBalance(address2)).to.equal(8)
        expect(await getBalance(address3)).to.equal(4)
      })

      it("allows flow to be reversed back to the sender", async function () {
        await vault.flow(fund, address1, address2, 3)
        await vault.flow(fund, address2, address1, 3)
        await mine()
        const start = await currentTime()
        await advanceTimeTo(start + 2)
        expect(await getBalance(address1)).to.equal(deposit)
        expect(await getBalance(address2)).to.equal(0)
        await advanceTimeTo(start + 4)
        expect(await getBalance(address1)).to.equal(deposit)
        expect(await getBalance(address2)).to.equal(0)
      })

      it("can change flows over time", async function () {
        await vault.flow(fund, address1, address2, 1)
        await vault.flow(fund, address1, address3, 2)
        await mine()
        const start = await currentTime()
        setNextBlockTimestamp(start + 4)
        await vault.flow(fund, address3, address2, 1)
        await mine()
        expect(await getBalance(address1)).to.equal(deposit - 12)
        expect(await getBalance(address2)).to.equal(4)
        expect(await getBalance(address3)).to.equal(8)
        await advanceTimeTo(start + 8)
        expect(await getBalance(address1)).to.equal(deposit - 24)
        expect(await getBalance(address2)).to.equal(12)
        expect(await getBalance(address3)).to.equal(12)
        await advanceTimeTo(start + 12)
        expect(await getBalance(address1)).to.equal(deposit - 36)
        expect(await getBalance(address2)).to.equal(20)
        expect(await getBalance(address3)).to.equal(16)
      })

      it("designates tokens that flow for the recipient", async function () {
        await vault.flow(fund, address1, address2, 3)
        await mine()
        const start = await currentTime()
        await advanceTimeTo(start + 7)
        expect(await vault.getDesignatedBalance(fund, address2)).to.equal(21)
      })

      it("designates tokens that flow back to the sender", async function () {
        await vault.flow(fund, address1, address1, 3)
        await mine()
        const start = await currentTime()
        await advanceTimeTo(start + 7)
        expect(await vault.getBalance(fund, address1)).to.equal(deposit)
        expect(await vault.getDesignatedBalance(fund, address1)).to.equal(21)
      })

      it("flows longer when lock is extended", async function () {
        await vault.flow(fund, address1, address2, 2)
        await mine()
        const start = await currentTime()
        await vault.extendLock(fund, maximum)
        await mine()
        await advanceTimeTo(maximum)
        const total = (maximum - start) * 2
        expect(await getBalance(address1)).to.equal(deposit - total)
        expect(await getBalance(address2)).to.equal(total)
        await advanceTimeTo(maximum + 10)
        expect(await getBalance(address1)).to.equal(deposit - total)
        expect(await getBalance(address2)).to.equal(total)
      })

      it("rejects flow when insufficient available tokens", async function () {
        setAutomine(true)
        await expect(
          vault.flow(fund, address1, address2, 11)
        ).to.be.revertedWith("InsufficientBalance")
      })

      it("rejects total flows exceeding available tokens", async function () {
        await vault.flow(fund, address1, address2, 10)
        setAutomine(true)
        await expect(
          vault.flow(fund, address1, address2, 1)
        ).to.be.revertedWith("InsufficientBalance")
      })

      it("cannot flow designated tokens", async function () {
        await vault.designate(fund, address1, 500)
        await vault.flow(fund, address1, address2, 5)
        setAutomine(true)
        await expect(
          vault.flow(fund, address1, address2, 1)
        ).to.be.revertedWith("InsufficientBalance")
      })
    })

    describe("burning", function () {
      const amount = 1000

      beforeEach(async function () {
        await setAutomine(true)
        await token.connect(account).approve(vault.address, amount)
        await vault.deposit(fund, account.address, amount)
      })

      it("can burn a deposit", async function () {
        await vault.burn(fund, account.address)
        expect(await vault.getBalance(fund, account.address)).to.equal(0)
      })

      it("moves the tokens to address 0xdead", async function () {
        const dead = "0x000000000000000000000000000000000000dead"
        const before = await token.balanceOf(dead)
        await vault.burn(fund, account.address)
        const after = await token.balanceOf(dead)
        expect(after - before).to.equal(amount)
      })

      it("allows designated tokens to be burned", async function () {
        await vault.designate(fund, account.address, 10)
        await vault.burn(fund, account.address)
        expect(await vault.getBalance(fund, account.address)).to.equal(0)
      })

      it("moves burned designated tokens to address 0xdead", async function () {
        const dead = "0x000000000000000000000000000000000000dead"
        await vault.designate(fund, account.address, 10)
        const before = await token.balanceOf(dead)
        await vault.burn(fund, account.address)
        const after = await token.balanceOf(dead)
        expect(after - before).to.equal(amount)
      })

      it("cannot burn tokens that are flowing", async function () {
        await vault.flow(fund, account.address, account2.address, 5)
        const burning1 = vault.burn(fund, account.address)
        await expect(burning1).to.be.revertedWith("FlowMustBeZero")
        const burning2 = vault.burn(fund, account2.address)
        await expect(burning2).to.be.revertedWith("FlowMustBeZero")
      })

      it("can burn tokens that are no longer flowing", async function () {
        await vault.flow(fund, account.address, account2.address, 5)
        await vault.flow(fund, account2.address, account.address, 5)
        await expect(vault.burn(fund, account.address)).not.to.be.reverted
      })
    })

    describe("withdrawing", function () {
      const amount = 1000

      beforeEach(async function () {
        await setAutomine(true)
        await token.connect(account).approve(vault.address, amount)
        await vault.deposit(fund, account.address, amount)
      })

      it("does not allow withdrawal before lock expires", async function () {
        await setNextBlockTimestamp(expiry - 1)
        const withdrawing = vault.withdraw(fund, account.address)
        await expect(withdrawing).to.be.revertedWith("Locked")
      })

      it("disallows withdrawal for everyone in the fund", async function () {
        const address1 = account.address
        const address2 = account2.address
        await vault.transfer(fund, address1, address2, amount / 2)
        let withdrawing1 = vault.withdraw(fund, address1)
        let withdrawing2 = vault.withdraw(fund, address2)
        await expect(withdrawing1).to.be.revertedWith("Locked")
        await expect(withdrawing2).to.be.revertedWith("Locked")
      })
    })
  })

  describe("when a fund lock is expiring", function () {
    let expiry
    let maximum

    beforeEach(async function () {
      const beginning = (await currentTime()) + 10
      expiry = beginning + 80
      maximum = beginning + 100
      await setAutomine(false)
      await setNextBlockTimestamp(beginning)
      await vault.lock(fund, expiry, maximum)
    })

    async function expire() {
      await setNextBlockTimestamp(expiry)
    }

    describe("locking", function () {
      beforeEach(async function () {
        await setAutomine(true)
      })

      it("cannot set lock when lock expired", async function () {
        await expire()
        const locking = vault.lock(fund, expiry, maximum)
        await expect(locking).to.be.revertedWith("AlreadyLocked")
      })

      it("cannot extend an expired lock", async function () {
        await expire()
        const extending = vault.extendLock(fund, maximum)
        await expect(extending).to.be.revertedWith("LockRequired")
      })

      it("deletes lock when no tokens remain", async function () {
        await token.connect(account).approve(vault.address, 30)
        await vault.deposit(fund, account.address, 30)
        await vault.transfer(fund, account.address, account2.address, 20)
        await vault.transfer(fund, account2.address, account3.address, 10)
        // some tokens are burned
        await vault.burn(fund, account2.address)
        await expire()
        // some tokens are withdrawn
        await vault.withdraw(fund, account.address)
        expect((await vault.getLock(fund))[0]).not.to.equal(0)
        expect((await vault.getLock(fund))[1]).not.to.equal(0)
        // remainder of the tokens are withdrawn by recipient
        await vault
          .connect(account3)
          .withdrawByRecipient(controller.address, fund)
        expect((await vault.getLock(fund))[0]).to.equal(0)
        expect((await vault.getLock(fund))[1]).to.equal(0)
      })
    })

    describe("flowing", function () {
      const deposit = 1000

      beforeEach(async function () {
        await token.connect(account).approve(vault.address, deposit)
        await vault.deposit(fund, account.address, deposit)
      })

      it("stops flows when lock expires", async function () {
        await vault.flow(fund, account.address, account2.address, 2)
        await mine()
        const start = await currentTime()
        const total = (expiry - start) * 2
        let balance1, balance2
        await advanceTimeTo(expiry)
        balance1 = await vault.getBalance(fund, account.address)
        balance2 = await vault.getBalance(fund, account2.address)
        expect(balance1).to.equal(deposit - total)
        expect(balance2).to.equal(total)
        await advanceTimeTo(expiry + 10)
        balance1 = await vault.getBalance(fund, account.address)
        balance2 = await vault.getBalance(fund, account2.address)
        expect(balance1).to.equal(deposit - total)
        expect(balance2).to.equal(total)
      })

      it("allows flowing tokens to be withdrawn", async function () {
        await vault.flow(fund, account.address, account2.address, 2)
        await mine()
        const start = await currentTime()
        const total = (expiry - start) * 2
        await advanceTimeTo(expiry + 10)
        balance1Before = await token.balanceOf(account.address)
        balance2Before = await token.balanceOf(account2.address)
        await vault.withdraw(fund, account.address)
        await vault.withdraw(fund, account2.address)
        await mine()
        balance1After = await token.balanceOf(account.address)
        balance2After = await token.balanceOf(account2.address)
        expect(balance1After - balance1Before).to.equal(deposit - total)
        expect(balance2After - balance2Before).to.equal(total)
      })

      it("does not allow new flows to start", async function () {
        await setAutomine(true)
        await expire()
        await expect(
          vault.flow(fund, account.address, account2.address, 0)
        ).to.be.revertedWith("LockRequired")
      })
    })

    describe("withdrawing", function () {
      const amount = 1000

      beforeEach(async function () {
        setAutomine(true)
        await token.connect(account).approve(vault.address, amount)
        await vault.deposit(fund, account.address, amount)
      })

      it("allows controller to withdraw for a recipient", async function () {
        await expire()
        const before = await token.balanceOf(account.address)
        await vault.withdraw(fund, account.address)
        const after = await token.balanceOf(account.address)
        expect(after - before).to.equal(amount)
      })

      it("allows recipient to withdraw for itself", async function () {
        await expire()
        const before = await token.balanceOf(account.address)
        await vault
          .connect(account)
          .withdrawByRecipient(controller.address, fund)
        const after = await token.balanceOf(account.address)
        expect(after - before).to.equal(amount)
      })

      it("empties the balance when withdrawing", async function () {
        await expire()
        await vault.withdraw(fund, account.address)
        expect(await vault.getBalance(fund, account.address)).to.equal(0)
      })

      it("allows designated tokens to be withdrawn", async function () {
        await vault.designate(fund, account.address, 10)
        await expire()
        const before = await token.balanceOf(account.address)
        await vault.withdraw(fund, account.address)
        const after = await token.balanceOf(account.address)
        expect(after - before).to.equal(amount)
      })

      it("does not withdraw designated tokens more than once", async function () {
        await vault.designate(fund, account.address, 10)
        await expire()
        await vault.withdraw(fund, account.address)
        const before = await token.balanceOf(account.address)
        await vault.withdraw(fund, account.address)
        const after = await token.balanceOf(account.address)
        expect(after).to.equal(before)
      })

      it("can withdraw funds that were transfered in", async function () {
        await vault.transfer(fund, account.address, account2.address, amount)
        await expire()
        const before = await token.balanceOf(account2.address)
        await vault.withdraw(fund, account2.address)
        const after = await token.balanceOf(account2.address)
        expect(after - before).to.equal(amount)
      })

      it("cannot withdraw funds that were transfered out", async function () {
        await vault.transfer(fund, account.address, account2.address, amount)
        await expire()
        const before = await token.balanceOf(account.address)
        await vault.withdraw(fund, account.address)
        const after = await token.balanceOf(account.address)
        expect(after).to.equal(before)
      })

      it("cannot withdraw more than once", async function () {
        await expire()
        await vault.withdraw(fund, account.address)
        const before = await token.balanceOf(account.address)
        await vault.withdraw(fund, account.address)
        const after = await token.balanceOf(account.address)
        expect(after).to.equal(before)
      })

      it("cannot withdraw burned tokens", async function () {
        await vault.burn(fund, account.address)
        await expire()
        const before = await token.balanceOf(account.address)
        await vault.withdraw(fund, account.address)
        const after = await token.balanceOf(account.address)
        expect(after).to.equal(before)
      })
    })

    it("does not allow depositing of tokens", async function () {
      setAutomine(true)
      await expire()
      const amount = 1000
      await token.connect(account).approve(vault.address, amount)
      await expect(
        vault.deposit(fund, account.address, amount)
      ).to.be.revertedWith("LockRequired")
    })

    it("does not allow designating tokens", async function () {
      setAutomine(true)
      await expire()
      await expect(
        vault.designate(fund, account.address, 0)
      ).to.be.revertedWith("LockRequired")
    })

    it("does not allow transfer of tokens", async function () {
      setAutomine(true)
      await expire()
      await expect(
        vault.transfer(fund, account.address, account2.address, 0)
      ).to.be.revertedWith("LockRequired")
    })

    it("does not allow burning of tokens", async function () {
      setAutomine(true)
      await expire()
      await expect(vault.burn(fund, account.address)).to.be.revertedWith(
        "LockRequired"
      )
    })
  })
})
