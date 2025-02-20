const { expect } = require("chai")
const { ethers } = require("hardhat")
const { randomBytes, hexlify } = ethers.utils
const {
  currentTime,
  advanceTimeTo,
  mine,
  setAutomine,
  setNextBlockTimestamp,
  snapshot,
  revert,
} = require("./evm")
const { LockStatus } = require("./vault")

describe("Vault", function () {
  const fund = randomBytes(32)

  let token
  let vault
  let controller
  let holder, holder2, holder3

  beforeEach(async function () {
    await snapshot()
    const TestToken = await ethers.getContractFactory("TestToken")
    token = await TestToken.deploy()
    const Vault = await ethers.getContractFactory("Vault")
    vault = await Vault.deploy(token.address)
    ;[controller, holder, holder2, holder3] = await ethers.getSigners()
    await token.mint(controller.address, 1_000_000)
  })

  afterEach(async function () {
    await revert()
  })

  describe("account ids", function () {
    let address
    let discriminator

    beforeEach(async function () {
      address = holder.address
      discriminator = hexlify(randomBytes(12))
    })

    it("encodes the account holder and a discriminator in an account id", async function () {
      const account = await vault.encodeAccountId(address, discriminator)
      const decoded = await vault.decodeAccountId(account)
      expect(decoded[0]).to.equal(address)
      expect(decoded[1]).to.equal(discriminator)
    })
  })

  describe("when a fund has no lock set", function () {
    let account

    beforeEach(async function () {
      account = await vault.encodeAccountId(holder.address, randomBytes(12))
    })

    it("does not have any balances", async function () {
      const balance = await vault.getBalance(fund, account)
      const designated = await vault.getDesignatedBalance(fund, account)
      expect(balance).to.equal(0)
      expect(designated).to.equal(0)
    })

    it("allows a lock to be set", async function () {
      const expiry = (await currentTime()) + 80
      const maximum = (await currentTime()) + 100
      await vault.lock(fund, expiry, maximum)
      expect(await vault.getLockStatus(fund)).to.equal(LockStatus.Locked)
      expect(await vault.getLockExpiry(fund)).to.equal(expiry)
    })

    it("does not allow a lock with expiry past maximum", async function () {
      let maximum = (await currentTime()) + 100
      const locking = vault.lock(fund, maximum + 1, maximum)
      await expect(locking).to.be.revertedWith("InvalidExpiry")
    })

    describe("fund is not locked", function () {
      testFundThatIsNotLocked()
    })
  })

  describe("when a fund is locked", function () {
    let expiry
    let maximum
    let account

    beforeEach(async function () {
      const beginning = (await currentTime()) + 10
      expiry = beginning + 80
      maximum = beginning + 100
      account = await vault.encodeAccountId(holder.address, randomBytes(12))
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
        expect(await vault.getLockExpiry(fund)).to.equal(expiry + 1)
        await vault.extendLock(fund, maximum)
        expect(await vault.getLockExpiry(fund)).to.equal(maximum)
      })

      it("cannot extend a lock past its maximum", async function () {
        const extending = vault.extendLock(fund, maximum + 1)
        await expect(extending).to.be.revertedWith("InvalidExpiry")
      })

      it("cannot move expiry forward", async function () {
        const extending = vault.extendLock(fund, expiry - 1)
        await expect(extending).to.be.revertedWith("InvalidExpiry")
      })

      it("does not delete lock when no tokens remain", async function () {
        await token.connect(controller).approve(vault.address, 30)
        await vault.deposit(fund, account, 30)
        await vault.burnAccount(fund, account)
        expect(await vault.getLockStatus(fund)).to.equal(LockStatus.Locked)
        expect(await vault.getLockExpiry(fund)).to.not.equal(0)
      })
    })

    describe("depositing", function () {
      const amount = 1000

      let account

      beforeEach(async function () {
        account = await vault.encodeAccountId(holder.address, randomBytes(12))
        await setAutomine(true)
      })

      it("accepts deposits of tokens", async function () {
        await token.connect(controller).approve(vault.address, amount)
        await vault.deposit(fund, account, amount)
        const balance = await vault.getBalance(fund, account)
        expect(balance).to.equal(amount)
      })

      it("keeps custody of tokens that are deposited", async function () {
        await token.connect(controller).approve(vault.address, amount)
        await vault.deposit(fund, account, amount)
        expect(await token.balanceOf(vault.address)).to.equal(amount)
      })

      it("deposit fails when tokens cannot be transferred", async function () {
        await token.connect(controller).approve(vault.address, amount - 1)
        const depositing = vault.deposit(fund, account, amount)
        await expect(depositing).to.be.revertedWith(
          "ERC20InsufficientAllowance"
        )
      })

      it("adds multiple deposits to the balance", async function () {
        await token.connect(controller).approve(vault.address, amount)
        await vault.deposit(fund, account, amount / 2)
        await vault.deposit(fund, account, amount / 2)
        const balance = await vault.getBalance(fund, account)
        expect(balance).to.equal(amount)
      })

      it("separates deposits from different accounts with the same holder", async function () {
        const address = holder.address
        const account1 = await vault.encodeAccountId(address, randomBytes(12))
        const account2 = await vault.encodeAccountId(address, randomBytes(12))
        await token.connect(controller).approve(vault.address, 3)
        await vault.deposit(fund, account1, 1)
        await vault.deposit(fund, account2, 2)
        expect(await vault.getBalance(fund, account1)).to.equal(1)
        expect(await vault.getBalance(fund, account2)).to.equal(2)
      })

      it("separates deposits from different funds", async function () {
        const fund1 = randomBytes(32)
        const fund2 = randomBytes(32)
        await vault.lock(fund1, expiry, maximum)
        await vault.lock(fund2, expiry, maximum)
        await token.connect(controller).approve(vault.address, 3)
        await vault.deposit(fund1, account, 1)
        await vault.deposit(fund2, account, 2)
        expect(await vault.getBalance(fund1, account)).to.equal(1)
        expect(await vault.getBalance(fund2, account)).to.equal(2)
      })

      it("separates deposits from different controllers", async function () {
        const controller1 = holder2
        const controller2 = holder3
        const vault1 = vault.connect(controller1)
        const vault2 = vault.connect(controller2)
        await vault1.lock(fund, expiry, maximum)
        await vault2.lock(fund, expiry, maximum)
        await token.mint(controller1.address, 1000)
        await token.mint(controller2.address, 1000)
        await token.connect(controller1).approve(vault.address, 1)
        await token.connect(controller2).approve(vault.address, 2)
        await vault1.deposit(fund, account, 1)
        await vault2.deposit(fund, account, 2)
        expect(await vault1.getBalance(fund, account)).to.equal(1)
        expect(await vault2.getBalance(fund, account)).to.equal(2)
      })
    })

    describe("designating", function () {
      const amount = 1000

      let account, account2

      beforeEach(async function () {
        account = await vault.encodeAccountId(holder.address, randomBytes(12))
        account2 = await vault.encodeAccountId(holder2.address, randomBytes(12))
        await token.connect(controller).approve(vault.address, amount)
        await vault.deposit(fund, account, amount)
      })

      it("can designate tokens for the account holder", async function () {
        await setAutomine(true)
        await vault.designate(fund, account, amount)
        expect(await vault.getDesignatedBalance(fund, account)).to.equal(amount)
      })

      it("can designate part of the balance", async function () {
        await setAutomine(true)
        await vault.designate(fund, account, 10)
        expect(await vault.getDesignatedBalance(fund, account)).to.equal(10)
      })

      it("adds up designated tokens", async function () {
        await setAutomine(true)
        await vault.designate(fund, account, 10)
        await vault.designate(fund, account, 10)
        expect(await vault.getDesignatedBalance(fund, account)).to.equal(20)
      })

      it("does not change the balance", async function () {
        await setAutomine(true)
        await vault.designate(fund, account, 10)
        expect(await vault.getBalance(fund, account)).to.equal(amount)
      })

      it("cannot designate more than the undesignated balance", async function () {
        await setAutomine(true)
        await vault.designate(fund, account, amount)
        await expect(vault.designate(fund, account, 1)).to.be.revertedWith(
          "InsufficientBalance"
        )
      })

      it("cannot designate tokens that are flowing", async function () {
        await vault.flow(fund, account, account2, 5)
        setAutomine(true)
        await vault.designate(fund, account, 500)
        const designating = vault.designate(fund, account, 1)
        await expect(designating).to.be.revertedWith("InsufficientBalance")
      })
    })

    describe("transfering", function () {
      const amount = 1000

      let account1, account2, account3

      beforeEach(async function () {
        account1 = await vault.encodeAccountId(holder.address, randomBytes(12))
        account2 = await vault.encodeAccountId(holder2.address, randomBytes(12))
        account3 = await vault.encodeAccountId(holder3.address, randomBytes(12))
        await token.connect(controller).approve(vault.address, amount)
        await vault.deposit(fund, account1, amount)
      })

      it("can transfer tokens from one recipient to the other", async function () {
        await setAutomine(true)
        await vault.transfer(fund, account1, account2, amount)
        expect(await vault.getBalance(fund, account1)).to.equal(0)
        expect(await vault.getBalance(fund, account2)).to.equal(amount)
      })

      it("can transfer part of a balance", async function () {
        await setAutomine(true)
        await vault.transfer(fund, account1, account2, 10)
        expect(await vault.getBalance(fund, account1)).to.equal(amount - 10)
        expect(await vault.getBalance(fund, account2)).to.equal(10)
      })

      it("can transfer out funds that were transfered in", async function () {
        await setAutomine(true)
        await vault.transfer(fund, account1, account2, amount)
        await vault.transfer(fund, account2, account3, amount)
        expect(await vault.getBalance(fund, account2)).to.equal(0)
        expect(await vault.getBalance(fund, account3)).to.equal(amount)
      })

      it("can transfer to self", async function () {
        await setAutomine(true)
        await vault.transfer(fund, account1, account1, amount)
        expect(await vault.getBalance(fund, account1)).to.equal(amount)
      })

      it("does not transfer more than the balance", async function () {
        await setAutomine(true)
        await expect(
          vault.transfer(fund, account1, account2, amount + 1)
        ).to.be.revertedWith("InsufficientBalance")
      })

      it("does not transfer designated tokens", async function () {
        await setAutomine(true)
        await vault.designate(fund, account1, 1)
        await expect(
          vault.transfer(fund, account1, account2, amount)
        ).to.be.revertedWith("InsufficientBalance")
      })

      it("does not transfer tokens that are flowing", async function () {
        await vault.flow(fund, account1, account2, 5)
        setAutomine(true)
        await vault.transfer(fund, account1, account2, 500)
        await expect(
          vault.transfer(fund, account1, account2, 1)
        ).to.be.revertedWith("InsufficientBalance")
      })
    })

    describe("flowing", function () {
      const deposit = 1000

      let account1, account2, account3

      beforeEach(async function () {
        account1 = await vault.encodeAccountId(holder.address, randomBytes(12))
        account2 = await vault.encodeAccountId(holder2.address, randomBytes(12))
        account3 = await vault.encodeAccountId(holder3.address, randomBytes(12))
        await token.connect(controller).approve(vault.address, deposit)
        await vault.deposit(fund, account1, deposit)
      })

      async function getBalance(account) {
        return await vault.getBalance(fund, account)
      }

      it("moves tokens over time", async function () {
        await vault.flow(fund, account1, account2, 2)
        mine()
        const start = await currentTime()
        await advanceTimeTo(start + 2)
        expect(await getBalance(account1)).to.equal(deposit - 4)
        expect(await getBalance(account2)).to.equal(4)
        await advanceTimeTo(start + 4)
        expect(await getBalance(account1)).to.equal(deposit - 8)
        expect(await getBalance(account2)).to.equal(8)
      })

      it("can move tokens to several different accounts", async function () {
        await vault.flow(fund, account1, account2, 1)
        await vault.flow(fund, account1, account3, 2)
        await mine()
        const start = await currentTime()
        await advanceTimeTo(start + 2)
        expect(await getBalance(account1)).to.equal(deposit - 6)
        expect(await getBalance(account2)).to.equal(2)
        expect(await getBalance(account3)).to.equal(4)
        await advanceTimeTo(start + 4)
        expect(await getBalance(account1)).to.equal(deposit - 12)
        expect(await getBalance(account2)).to.equal(4)
        expect(await getBalance(account3)).to.equal(8)
      })

      it("allows flows to be diverted to other account", async function () {
        await vault.flow(fund, account1, account2, 3)
        await vault.flow(fund, account2, account3, 1)
        await mine()
        const start = await currentTime()
        await advanceTimeTo(start + 2)
        expect(await getBalance(account1)).to.equal(deposit - 6)
        expect(await getBalance(account2)).to.equal(4)
        expect(await getBalance(account3)).to.equal(2)
        await advanceTimeTo(start + 4)
        expect(await getBalance(account1)).to.equal(deposit - 12)
        expect(await getBalance(account2)).to.equal(8)
        expect(await getBalance(account3)).to.equal(4)
      })

      it("allows flow to be reversed back to the sender", async function () {
        await vault.flow(fund, account1, account2, 3)
        await vault.flow(fund, account2, account1, 3)
        await mine()
        const start = await currentTime()
        await advanceTimeTo(start + 2)
        expect(await getBalance(account1)).to.equal(deposit)
        expect(await getBalance(account2)).to.equal(0)
        await advanceTimeTo(start + 4)
        expect(await getBalance(account1)).to.equal(deposit)
        expect(await getBalance(account2)).to.equal(0)
      })

      it("can change flows over time", async function () {
        await vault.flow(fund, account1, account2, 1)
        await vault.flow(fund, account1, account3, 2)
        await mine()
        const start = await currentTime()
        setNextBlockTimestamp(start + 4)
        await vault.flow(fund, account3, account2, 1)
        await mine()
        expect(await getBalance(account1)).to.equal(deposit - 12)
        expect(await getBalance(account2)).to.equal(4)
        expect(await getBalance(account3)).to.equal(8)
        await advanceTimeTo(start + 8)
        expect(await getBalance(account1)).to.equal(deposit - 24)
        expect(await getBalance(account2)).to.equal(12)
        expect(await getBalance(account3)).to.equal(12)
        await advanceTimeTo(start + 12)
        expect(await getBalance(account1)).to.equal(deposit - 36)
        expect(await getBalance(account2)).to.equal(20)
        expect(await getBalance(account3)).to.equal(16)
      })

      it("designates tokens that flow into the account", async function () {
        await vault.flow(fund, account1, account2, 3)
        await mine()
        const start = await currentTime()
        await advanceTimeTo(start + 7)
        expect(await vault.getDesignatedBalance(fund, account2)).to.equal(21)
      })

      it("designates tokens that flow back to the sender", async function () {
        await vault.flow(fund, account1, account1, 3)
        await mine()
        const start = await currentTime()
        await advanceTimeTo(start + 7)
        expect(await vault.getBalance(fund, account1)).to.equal(deposit)
        expect(await vault.getDesignatedBalance(fund, account1)).to.equal(21)
      })

      it("flows longer when lock is extended", async function () {
        await vault.flow(fund, account1, account2, 2)
        await mine()
        const start = await currentTime()
        await vault.extendLock(fund, maximum)
        await mine()
        await advanceTimeTo(maximum)
        const total = (maximum - start) * 2
        expect(await getBalance(account1)).to.equal(deposit - total)
        expect(await getBalance(account2)).to.equal(total)
        await advanceTimeTo(maximum + 10)
        expect(await getBalance(account1)).to.equal(deposit - total)
        expect(await getBalance(account2)).to.equal(total)
      })

      it("rejects flow when insufficient available tokens", async function () {
        setAutomine(true)
        await expect(
          vault.flow(fund, account1, account2, 11)
        ).to.be.revertedWith("InsufficientBalance")
      })

      it("rejects total flows exceeding available tokens", async function () {
        await vault.flow(fund, account1, account2, 10)
        setAutomine(true)
        await expect(
          vault.flow(fund, account1, account2, 1)
        ).to.be.revertedWith("InsufficientBalance")
      })

      it("cannot flow designated tokens", async function () {
        await vault.designate(fund, account1, 500)
        await vault.flow(fund, account1, account2, 5)
        setAutomine(true)
        await expect(
          vault.flow(fund, account1, account2, 1)
        ).to.be.revertedWith("InsufficientBalance")
      })
    })

    describe("burning", function () {
      const dead = "0x000000000000000000000000000000000000dead"
      const amount = 1000

      let account1, account2, account3

      beforeEach(async function () {
        account1 = await vault.encodeAccountId(holder.address, randomBytes(12))
        account2 = await vault.encodeAccountId(holder2.address, randomBytes(12))
        account3 = await vault.encodeAccountId(holder3.address, randomBytes(12))
        await setAutomine(true)
        await token.connect(controller).approve(vault.address, amount)
        await vault.deposit(fund, account1, amount)
      })

      describe("burn designated", function () {
        const designated = 100

        beforeEach(async function () {
          await vault.designate(fund, account1, designated)
        })

        it("burns a number of designated tokens", async function () {
          await vault.burnDesignated(fund, account1, 10)
          expect(await vault.getDesignatedBalance(fund, account1)).to.equal(
            designated - 10
          )
          expect(await vault.getBalance(fund, account1)).to.equal(amount - 10)
        })

        it("can burn all of the designated tokens", async function () {
          await vault.burnDesignated(fund, account1, designated)
          expect(await vault.getDesignatedBalance(fund, account1)).to.equal(0)
          expect(await vault.getBalance(fund, account1)).to.equal(
            amount - designated
          )
        })

        it("moves burned tokens to address 0xdead", async function () {
          const before = await token.balanceOf(dead)
          await vault.burnDesignated(fund, account1, 10)
          const after = await token.balanceOf(dead)
          expect(after - before).to.equal(10)
        })

        it("can burn designated when tokens are flowing", async function () {
          await vault.flow(fund, account1, account2, 5)
          await expect(vault.burnDesignated(fund, account1, designated)).not.to
            .be.reverted
        })

        it("cannot burn more than all designated tokens", async function () {
          await expect(
            vault.burnDesignated(fund, account1, designated + 1)
          ).to.be.revertedWith("InsufficientBalance")
        })
      })

      describe("burn account", function () {
        it("can burn an account", async function () {
          await vault.burnAccount(fund, account1)
          expect(await vault.getBalance(fund, account1)).to.equal(0)
        })

        it("also burns the designated tokens", async function () {
          await vault.designate(fund, account1, 10)
          await vault.burnAccount(fund, account1)
          expect(await vault.getDesignatedBalance(fund, account1)).to.equal(0)
        })

        it("moves account tokens to address 0xdead", async function () {
          await vault.designate(fund, account1, 10)
          const before = await token.balanceOf(dead)
          await vault.burnAccount(fund, account1)
          const after = await token.balanceOf(dead)
          expect(after - before).to.equal(amount)
        })

        it("does not burn tokens from other accounts with the same holder", async function () {
          const account1a = await vault.encodeAccountId(
            holder.address,
            randomBytes(12)
          )
          await vault.transfer(fund, account1, account1a, 10)
          await vault.burnAccount(fund, account1)
          expect(await vault.getBalance(fund, account1a)).to.equal(10)
        })

        it("cannot burn tokens that are flowing", async function () {
          await vault.flow(fund, account1, account2, 5)
          const burning1 = vault.burnAccount(fund, account1)
          await expect(burning1).to.be.revertedWith("FlowNotZero")
          const burning2 = vault.burnAccount(fund, account2)
          await expect(burning2).to.be.revertedWith("FlowNotZero")
        })

        it("can burn tokens that are no longer flowing", async function () {
          await vault.flow(fund, account1, account2, 5)
          await vault.flow(fund, account2, account1, 5)
          await expect(vault.burnAccount(fund, account1)).not.to.be.reverted
        })
      })

      describe("burn fund", function () {
        it("can burn an entire fund", async function () {
          await vault.transfer(fund, account1, account2, 10)
          await vault.transfer(fund, account1, account3, 10)
          await vault.burnFund(fund)
          expect(await vault.getLockStatus(fund)).to.equal(LockStatus.Burned)
          expect(await vault.getBalance(fund, account1)).to.equal(0)
          expect(await vault.getBalance(fund, account2)).to.equal(0)
          expect(await vault.getBalance(fund, account3)).to.equal(0)
        })

        it("moves all tokens in the fund to address 0xdead", async function () {
          await vault.transfer(fund, account1, account2, 10)
          await vault.transfer(fund, account1, account3, 10)
          const before = await token.balanceOf(dead)
          await vault.burnFund(fund)
          const after = await token.balanceOf(dead)
          expect(after - before).to.equal(amount)
        })

        it("can burn fund when tokens are flowing", async function () {
          await vault.flow(fund, account1, account2, 5)
          await expect(vault.burnFund(fund)).not.to.be.reverted
        })
      })
    })

    describe("withdrawing", function () {
      const amount = 1000

      let account1, account2

      beforeEach(async function () {
        account1 = await vault.encodeAccountId(holder.address, randomBytes(12))
        account2 = await vault.encodeAccountId(holder2.address, randomBytes(12))
        await setAutomine(true)
        await token.connect(controller).approve(vault.address, amount)
        await vault.deposit(fund, account1, amount)
      })

      it("does not allow withdrawal before lock expires", async function () {
        await setNextBlockTimestamp(expiry - 1)
        const withdrawing = vault.withdraw(fund, account1)
        await expect(withdrawing).to.be.revertedWith("FundNotUnlocked")
      })

      it("disallows withdrawal for everyone in the fund", async function () {
        await vault.transfer(fund, account1, account2, amount / 2)
        let withdrawing1 = vault.withdraw(fund, account1)
        let withdrawing2 = vault.withdraw(fund, account2)
        await expect(withdrawing1).to.be.revertedWith("FundNotUnlocked")
        await expect(withdrawing2).to.be.revertedWith("FundNotUnlocked")
      })
    })
  })

  describe("when a fund lock is expiring", function () {
    let expiry
    let maximum
    let account1, account2, account3

    beforeEach(async function () {
      const beginning = (await currentTime()) + 10
      expiry = beginning + 80
      maximum = beginning + 100
      account1 = await vault.encodeAccountId(holder.address, randomBytes(12))
      account2 = await vault.encodeAccountId(holder2.address, randomBytes(12))
      account3 = await vault.encodeAccountId(holder3.address, randomBytes(12))
      await setAutomine(false)
      await setNextBlockTimestamp(beginning)
      await vault.lock(fund, expiry, maximum)
    })

    async function expire() {
      await setNextBlockTimestamp(expiry)
    }

    it("unlocks the funds", async function () {
      await mine()
      expect(await vault.getLockStatus(fund)).to.equal(LockStatus.Locked)
      await expire()
      await mine()
      expect(await vault.getLockStatus(fund)).to.equal(LockStatus.Unlocked)
    })

    describe("locking", function () {
      beforeEach(async function () {
        await setAutomine(true)
      })

      it("cannot set lock when lock expired", async function () {
        await expire()
        const locking = vault.lock(fund, expiry, maximum)
        await expect(locking).to.be.revertedWith("AlreadyLocked")
      })

      it("deletes lock when no tokens remain", async function () {
        await token.connect(controller).approve(vault.address, 30)
        await vault.deposit(fund, account1, 30)
        await vault.transfer(fund, account1, account2, 20)
        await vault.transfer(fund, account2, account3, 10)
        // some designated tokens are burned
        await vault.designate(fund, account2, 10)
        await vault.burnDesignated(fund, account2, 5)
        // some holder is burned
        await vault.burnAccount(fund, account2)
        await expire()
        // some tokens are withdrawn
        await vault.withdraw(fund, account1)
        expect(await vault.getLockStatus(fund)).to.equal(LockStatus.Unlocked)
        expect(await vault.getLockExpiry(fund)).not.to.equal(0)
        // remainder of the tokens are withdrawn by recipient
        await vault
          .connect(holder3)
          .withdrawByRecipient(controller.address, fund, account3)
        expect(await vault.getLockStatus(fund)).to.equal(LockStatus.NoLock)
        expect(await vault.getLockExpiry(fund)).to.equal(0)
      })
    })

    describe("flowing", function () {
      const deposit = 1000

      beforeEach(async function () {
        await token.connect(controller).approve(vault.address, deposit)
        await vault.deposit(fund, account1, deposit)
      })

      it("stops flows when lock expires", async function () {
        await vault.flow(fund, account1, account2, 2)
        await mine()
        const start = await currentTime()
        const total = (expiry - start) * 2
        let balance1, balance2
        await advanceTimeTo(expiry)
        balance1 = await vault.getBalance(fund, account1)
        balance2 = await vault.getBalance(fund, account2)
        expect(balance1).to.equal(deposit - total)
        expect(balance2).to.equal(total)
        await advanceTimeTo(expiry + 10)
        balance1 = await vault.getBalance(fund, account1)
        balance2 = await vault.getBalance(fund, account2)
        expect(balance1).to.equal(deposit - total)
        expect(balance2).to.equal(total)
      })

      it("allows flowing tokens to be withdrawn", async function () {
        await vault.flow(fund, account1, account2, 2)
        await mine()
        const start = await currentTime()
        const total = (expiry - start) * 2
        await advanceTimeTo(expiry + 10)
        balance1Before = await token.balanceOf(holder.address)
        balance2Before = await token.balanceOf(holder2.address)
        await vault.withdraw(fund, account1)
        await vault.withdraw(fund, account2)
        await mine()
        balance1After = await token.balanceOf(holder.address)
        balance2After = await token.balanceOf(holder2.address)
        expect(balance1After - balance1Before).to.equal(deposit - total)
        expect(balance2After - balance2Before).to.equal(total)
      })
    })

    describe("withdrawing", function () {
      const amount = 1000

      beforeEach(async function () {
        setAutomine(true)
        await token.connect(controller).approve(vault.address, amount)
        await vault.deposit(fund, account1, amount)
        await token.connect(controller).approve(vault.address, amount)
        await vault.deposit(fund, account2, amount)
      })

      it("allows controller to withdraw for a recipient", async function () {
        await expire()
        const before = await token.balanceOf(holder.address)
        await vault.withdraw(fund, account1)
        const after = await token.balanceOf(holder.address)
        expect(after - before).to.equal(amount)
      })

      it("allows account holder to withdraw for itself", async function () {
        await expire()
        const before = await token.balanceOf(holder.address)
        await vault
          .connect(holder)
          .withdrawByRecipient(controller.address, fund, account1)
        const after = await token.balanceOf(holder.address)
        expect(after - before).to.equal(amount)
      })

      it("does not allow anyone else to withdraw for the account holder", async function () {
        await expire()
        await expect(
          vault
            .connect(holder2)
            .withdrawByRecipient(controller.address, fund, account1)
        ).to.be.revertedWith("OnlyAccountHolder")
      })

      it("empties the balance when withdrawing", async function () {
        await expire()
        await vault.withdraw(fund, account1)
        expect(await vault.getBalance(fund, account1)).to.equal(0)
      })

      it("does not withdraw other accounts from the same holder", async function () {
        const account1a = await vault.encodeAccountId(
          holder.address,
          randomBytes(12)
        )
        await vault.transfer(fund, account1, account1a, 10)
        await expire()
        await vault.withdraw(fund, account1)
        expect(await vault.getBalance(fund, account1a)).to.equal(10)
      })

      it("allows designated tokens to be withdrawn", async function () {
        await vault.designate(fund, account1, 10)
        await expire()
        const before = await token.balanceOf(holder.address)
        await vault.withdraw(fund, account1)
        const after = await token.balanceOf(holder.address)
        expect(after - before).to.equal(amount)
      })

      it("does not withdraw designated tokens more than once", async function () {
        await vault.designate(fund, account1, 10)
        await expire()
        await vault.withdraw(fund, account1)
        const before = await token.balanceOf(holder.address)
        await vault.withdraw(fund, account1)
        const after = await token.balanceOf(holder.address)
        expect(after).to.equal(before)
      })

      it("can withdraw funds that were transfered in", async function () {
        await vault.transfer(fund, account1, account3, amount)
        await expire()
        const before = await token.balanceOf(holder3.address)
        await vault.withdraw(fund, account3)
        const after = await token.balanceOf(holder3.address)
        expect(after - before).to.equal(amount)
      })

      it("cannot withdraw funds that were transfered out", async function () {
        await vault.transfer(fund, account1, account3, amount)
        await expire()
        const before = await token.balanceOf(holder.address)
        await vault.withdraw(fund, account1)
        const after = await token.balanceOf(holder.address)
        expect(after).to.equal(before)
      })

      it("cannot withdraw more than once", async function () {
        await expire()
        await vault.withdraw(fund, account1)
        const before = await token.balanceOf(holder.address)
        await vault.withdraw(fund, account1)
        const after = await token.balanceOf(holder.address)
        expect(after).to.equal(before)
      })

      it("cannot withdraw burned tokens", async function () {
        await vault.burnAccount(fund, account1)
        await expire()
        const before = await token.balanceOf(holder.address)
        await vault.withdraw(fund, account1)
        const after = await token.balanceOf(holder.address)
        expect(after).to.equal(before)
      })
    })

    describe("fund is not locked", function () {
      beforeEach(async function () {
        setAutomine(true)
        await expire()
      })

      testFundThatIsNotLocked()
    })
  })

  describe("when a fund is burned", function () {
    const amount = 1000

    let expiry
    let account

    beforeEach(async function () {
      expiry = (await currentTime()) + 100
      account = await vault.encodeAccountId(holder.address, randomBytes(12))
      await token.connect(controller).approve(vault.address, amount)
      await vault.lock(fund, expiry, expiry)
      await vault.deposit(fund, account, amount)
      await vault.burnFund(fund)
    })

    testBurnedFund()

    describe("when the lock expires", function () {
      beforeEach(async function () {
        await advanceTimeTo(expiry)
      })

      testBurnedFund()
    })

    function testBurnedFund() {
      it("cannot set lock", async function () {
        const locking = vault.lock(fund, expiry, expiry)
        await expect(locking).to.be.revertedWith("FundAlreadyLocked")
      })

      it("cannot withdraw", async function () {
        const withdrawing = vault.withdraw(fund, account)
        await expect(withdrawing).to.be.revertedWith("FundNotUnlocked")
      })

      testFundThatIsNotLocked()
    }
  })

  function testFundThatIsNotLocked() {
    let account, account2

    beforeEach(async function () {
      account = await vault.encodeAccountId(holder.address, randomBytes(12))
      account2 = await vault.encodeAccountId(holder2.address, randomBytes(12))
    })

    it("does not allow extending of lock", async function () {
      await expect(
        vault.extendLock(fund, (await currentTime()) + 1)
      ).to.be.revertedWith("FundNotLocked")
    })

    it("does not allow depositing of tokens", async function () {
      const amount = 1000
      await token.connect(controller).approve(vault.address, amount)
      await expect(vault.deposit(fund, account, amount)).to.be.revertedWith(
        "FundNotLocked"
      )
    })

    it("does not allow designating tokens", async function () {
      await expect(vault.designate(fund, account, 0)).to.be.revertedWith(
        "FundNotLocked"
      )
    })

    it("does not allow transfer of tokens", async function () {
      await expect(
        vault.transfer(fund, account, account2, 0)
      ).to.be.revertedWith("FundNotLocked")
    })

    it("does not allow new token flows to start", async function () {
      await expect(vault.flow(fund, account, account2, 0)).to.be.revertedWith(
        "FundNotLocked"
      )
    })

    it("does not allow burning of designated tokens", async function () {
      await expect(vault.burnDesignated(fund, account, 1)).to.be.revertedWith(
        "FundNotLocked"
      )
    })

    it("does not allow burning of accounts", async function () {
      await expect(vault.burnAccount(fund, account)).to.be.revertedWith(
        "FundNotLocked"
      )
    })

    it("does not allow burning an entire fund", async function () {
      await expect(vault.burnFund(fund)).to.be.revertedWith("FundNotLocked")
    })
  }

  describe("pausing", function () {
    let owner
    let owner2
    let other

    beforeEach(async function () {
      ;[owner, owner2, other] = await ethers.getSigners()
    })

    it("allows the vault to be paused by the owner", async function () {
      await expect(vault.connect(owner).pause()).not.to.be.reverted
    })

    it("allows the vault to be unpaused by the owner", async function () {
      await vault.connect(owner).pause()
      await expect(vault.connect(owner).unpause()).not.to.be.reverted
    })

    it("does not allow pause to be called by others", async function () {
      await expect(vault.connect(other).pause()).to.be.revertedWith(
        "UnauthorizedAccount"
      )
    })

    it("does not allow unpause to be called by others", async function () {
      await vault.connect(owner).pause()
      await expect(vault.connect(other).unpause()).to.be.revertedWith(
        "UnauthorizedAccount"
      )
    })

    it("allows the ownership to change", async function () {
      await vault.connect(owner).pause()
      await vault.connect(owner).transferOwnership(owner2.address)
      await expect(vault.connect(owner2).unpause()).not.to.be.reverted
    })

    it("allows the ownership to be renounced", async function () {
      await vault.connect(owner).renounceOwnership()
      await expect(vault.connect(owner).pause()).to.be.revertedWith(
        "UnauthorizedAccount"
      )
    })

    describe("when the vault is paused", function () {
      let expiry
      let maximum
      let account1, account2

      beforeEach(async function () {
        expiry = (await currentTime()) + 80
        maximum = (await currentTime()) + 100
        account1 = await vault.encodeAccountId(holder.address, randomBytes(12))
        account2 = await vault.encodeAccountId(holder2.address, randomBytes(12))
        await vault.lock(fund, expiry, maximum)
        await token.approve(vault.address, 1000)
        await vault.deposit(fund, account1, 1000)
        await vault.designate(fund, account1, 100)
        await vault.connect(owner).pause()
      })

      it("only allows a recipient to withdraw itself", async function () {
        await advanceTimeTo(expiry)
        await expect(
          vault
            .connect(holder)
            .withdrawByRecipient(controller.address, fund, account1)
        ).not.to.be.reverted
      })

      it("does not allow funds to be locked", async function () {
        const fund = randomBytes(32)
        const expiry = (await currentTime()) + 100
        await expect(vault.lock(fund, expiry, expiry)).to.be.revertedWith(
          "EnforcedPause"
        )
      })

      it("does not allow extending of lock", async function () {
        await expect(vault.extendLock(fund, maximum)).to.be.revertedWith(
          "EnforcedPause"
        )
      })

      it("does not allow depositing of tokens", async function () {
        await token.approve(vault.address, 100)
        await expect(vault.deposit(fund, account1, 100)).to.be.revertedWith(
          "EnforcedPause"
        )
      })

      it("does not allow designating tokens", async function () {
        await expect(vault.designate(fund, account1, 10)).to.be.revertedWith(
          "EnforcedPause"
        )
      })

      it("does not allow transfer of tokens", async function () {
        await expect(
          vault.transfer(fund, account1, account2, 10)
        ).to.be.revertedWith("EnforcedPause")
      })

      it("does not allow new token flows to start", async function () {
        await expect(
          vault.flow(fund, account1, account2, 1)
        ).to.be.revertedWith("EnforcedPause")
      })

      it("does not allow burning of designated tokens", async function () {
        await expect(
          vault.burnDesignated(fund, account1, 10)
        ).to.be.revertedWith("EnforcedPause")
      })

      it("does not allow burning of accounts", async function () {
        await expect(vault.burnAccount(fund, account1)).to.be.revertedWith(
          "EnforcedPause"
        )
      })

      it("does not allow burning an entire fund", async function () {
        await expect(vault.burnFund(fund)).to.be.revertedWith("EnforcedPause")
      })

      it("does not allow a controller to withdraw for a recipient", async function () {
        await advanceTimeTo(expiry)
        await expect(vault.withdraw(fund, account1)).to.be.revertedWith(
          "EnforcedPause"
        )
      })
    })
  })
})
