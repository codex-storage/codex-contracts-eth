const { expect } = require("chai")
const { ethers } = require("hardhat")
const { randomBytes, hexlify } = ethers
const {
  currentTime,
  advanceTimeTo,
  mine,
  setAutomine,
  setNextBlockTimestamp,
  snapshot,
  revert,
} = require("./evm")
const { FundStatus } = require("./vault")
const VaultModule = require("../ignition/modules/vault")

describe("Vault", function () {
  const fund = randomBytes(32)

  let token
  let vault
  let controller
  let holder, holder2, holder3

  beforeEach(async function () {
    await snapshot()

    const { vault: _vault, token: _token } = await ignition.deploy(
      VaultModule,
      {}
    )
    vault = _vault
    token = _token
    ;[controller, holder, holder2, holder3] = await ethers.getSigners()
    const tx = await token.mint(await controller.getAddress(), 1_000_000)
    await tx.wait()
  })

  afterEach(async function () {
    await revert()
  })

  describe("account ids", function () {
    let address
    let discriminator

    beforeEach(async function () {
      address = await holder.getAddress()
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
      account = await vault.encodeAccountId(
        await holder.getAddress(),
        randomBytes(12)
      )
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
      expect(await vault.getFundStatus(fund)).to.equal(FundStatus.Locked)
      expect(await vault.getLockExpiry(fund)).to.equal(expiry)
    })

    it("does not allow a lock with expiry past maximum", async function () {
      let maximum = (await currentTime()) + 100
      const locking = vault.lock(fund, maximum + 1, maximum)
      await expect(locking).to.be.revertedWithCustomError(
        vault,
        "VaultInvalidExpiry"
      )
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
      account = await vault.encodeAccountId(
        await holder.getAddress(),
        randomBytes(12)
      )
      await setAutomine(false)
      await setNextBlockTimestamp(beginning)
      await vault.lock(fund, expiry, maximum)
    })

    describe("locking", function () {
      beforeEach(async function () {
        await setAutomine(true)
      })

      it("cannot set lock when already locked", async function () {
        await expect(
          vault.lock(fund, expiry, maximum)
        ).to.be.revertedWithCustomError(vault, "VaultFundAlreadyLocked")
      })

      it("can extend a lock expiry up to its maximum", async function () {
        await vault.extendLock(fund, expiry + 1)
        expect(await vault.getLockExpiry(fund)).to.equal(expiry + 1)
        await vault.extendLock(fund, maximum)
        expect(await vault.getLockExpiry(fund)).to.equal(maximum)
      })

      it("cannot extend a lock past its maximum", async function () {
        const extending = vault.extendLock(fund, maximum + 1)
        await expect(extending).to.be.revertedWithCustomError(
          vault,
          "VaultInvalidExpiry"
        )
      })

      it("cannot move expiry to an earlier time", async function () {
        const extending = vault.extendLock(fund, expiry - 1)
        await expect(extending).to.be.revertedWithCustomError(
          vault,
          "VaultInvalidExpiry"
        )
      })

      it("does not delete lock when no tokens remain", async function () {
        await token.connect(controller).approve(await vault.getAddress(), 30)
        await vault.deposit(fund, account, 30)
        await vault.burnAccount(fund, account)
        expect(await vault.getFundStatus(fund)).to.equal(FundStatus.Locked)
        expect(await vault.getLockExpiry(fund)).to.not.equal(0)
      })
    })

    describe("depositing", function () {
      const amount = 1000

      let account

      beforeEach(async function () {
        account = await vault.encodeAccountId(
          await holder.getAddress(),
          randomBytes(12)
        )
        await setAutomine(true)
      })

      it("accepts deposits of tokens", async function () {
        await token
          .connect(controller)
          .approve(await vault.getAddress(), amount)
        await vault.deposit(fund, account, amount)
        const balance = await vault.getBalance(fund, account)
        expect(balance).to.equal(amount)
      })

      it("keeps custody of tokens that are deposited", async function () {
        await token
          .connect(controller)
          .approve(await vault.getAddress(), amount)
        await vault.deposit(fund, account, amount)
        expect(await token.balanceOf(await vault.getAddress())).to.equal(amount)
      })

      it("deposit fails when tokens cannot be transferred", async function () {
        await token
          .connect(controller)
          .approve(await vault.getAddress(), amount - 1)
        const depositing = vault.deposit(fund, account, amount)
        await expect(depositing).to.be.revertedWithCustomError(
          token,
          "ERC20InsufficientAllowance"
        )
      })

      it("adds multiple deposits to the balance", async function () {
        await token
          .connect(controller)
          .approve(await vault.getAddress(), amount)
        await vault.deposit(fund, account, amount / 2)
        await vault.deposit(fund, account, amount / 2)
        const balance = await vault.getBalance(fund, account)
        expect(balance).to.equal(amount)
      })

      it("separates deposits from different accounts with the same holder", async function () {
        const address = await holder.getAddress()
        const account1 = await vault.encodeAccountId(address, randomBytes(12))
        const account2 = await vault.encodeAccountId(address, randomBytes(12))
        await token.connect(controller).approve(await vault.getAddress(), 3)
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
        await token.connect(controller).approve(await vault.getAddress(), 3)
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
        await token.mint(await controller1.getAddress(), 1000)
        await token.mint(await controller2.getAddress(), 1000)
        await token.connect(controller1).approve(await vault.getAddress(), 1)
        await token.connect(controller2).approve(await vault.getAddress(), 2)
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
        account = await vault.encodeAccountId(
          await holder.getAddress(),
          randomBytes(12)
        )
        account2 = await vault.encodeAccountId(
          await holder2.getAddress(),
          randomBytes(12)
        )
        await token
          .connect(controller)
          .approve(await vault.getAddress(), amount)
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
        await expect(
          vault.designate(fund, account, 1)
        ).to.be.revertedWithCustomError(vault, "VaultInsufficientBalance")
      })

      it("cannot designate tokens that are flowing", async function () {
        await vault.flow(fund, account, account2, 5)
        setAutomine(true)
        await vault.designate(fund, account, 500)
        const designating = vault.designate(fund, account, 1)
        await expect(designating).to.be.revertedWithCustomError(
          vault,
          "VaultInsufficientBalance"
        )
      })
    })

    describe("transfering", function () {
      const amount = 1000

      let account1, account2, account3

      beforeEach(async function () {
        account1 = await vault.encodeAccountId(
          await holder.getAddress(),
          randomBytes(12)
        )
        account2 = await vault.encodeAccountId(
          await holder2.getAddress(),
          randomBytes(12)
        )
        account3 = await vault.encodeAccountId(
          await holder3.getAddress(),
          randomBytes(12)
        )
        await token
          .connect(controller)
          .approve(await vault.getAddress(), amount)
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
        ).to.be.revertedWithCustomError(vault, "VaultInsufficientBalance")
      })

      it("does not transfer designated tokens", async function () {
        await setAutomine(true)
        await vault.designate(fund, account1, 1)
        await expect(
          vault.transfer(fund, account1, account2, amount)
        ).to.be.revertedWithCustomError(vault, "VaultInsufficientBalance")
      })

      it("does not transfer tokens that are flowing", async function () {
        await vault.flow(fund, account1, account2, 5)
        setAutomine(true)
        await vault.transfer(fund, account1, account2, 500)
        await expect(
          vault.transfer(fund, account1, account2, 1)
        ).to.be.revertedWithCustomError(vault, "VaultInsufficientBalance")
      })
    })

    describe("flowing", function () {
      const deposit = 1000

      let account1, account2, account3

      beforeEach(async function () {
        account1 = await vault.encodeAccountId(
          await holder.getAddress(),
          randomBytes(12)
        )
        account2 = await vault.encodeAccountId(
          await holder2.getAddress(),
          randomBytes(12)
        )
        account3 = await vault.encodeAccountId(
          await holder3.getAddress(),
          randomBytes(12)
        )
        await token
          .connect(controller)
          .approve(await vault.getAddress(), deposit)
        await vault.deposit(fund, account1, deposit)
      })

      async function getBalance(account) {
        return await vault.getBalance(fund, account)
      }

      it("moves tokens over time", async function () {
        await setAutomine(true)

        await vault.flow(fund, account1, account2, 2)

        const start = await currentTime()
        await advanceTimeTo(start + 2)
        expect(await getBalance(account1)).to.equal(deposit - 4)
        expect(await getBalance(account2)).to.equal(4)
        await advanceTimeTo(start + 4)
        expect(await getBalance(account1)).to.equal(deposit - 8)
        expect(await getBalance(account2)).to.equal(8)
      })

      it("can move tokens to several different accounts", async function () {
        setAutomine(true)

        await vault.flow(fund, account1, account2, 1)
        await vault.flow(fund, account1, account3, 2)

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
        setAutomine(true)

        await vault.flow(fund, account1, account2, 3)
        await vault.flow(fund, account2, account3, 1)

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
        setAutomine(true)

        await vault.flow(fund, account1, account2, 3)
        await vault.flow(fund, account2, account1, 3)

        const start = await currentTime()
        await advanceTimeTo(start + 2)
        expect(await getBalance(account1)).to.equal(deposit)
        expect(await getBalance(account2)).to.equal(0)
        await advanceTimeTo(start + 4)
        expect(await getBalance(account1)).to.equal(deposit)
        expect(await getBalance(account2)).to.equal(0)
      })

      it("can change flows over time", async function () {
        setAutomine(true)

        await vault.flow(fund, account1, account2, 1)
        await vault.flow(fund, account1, account3, 2)

        const start = await currentTime()
        setNextBlockTimestamp(start + 4)
        await vault.flow(fund, account3, account2, 1)

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
        setAutomine(true)

        await vault.flow(fund, account1, account2, 3)

        const start = await currentTime()
        await advanceTimeTo(start + 7)
        expect(await vault.getDesignatedBalance(fund, account2)).to.equal(21)
      })

      it("designates tokens that flow back to the sender", async function () {
        setAutomine(true)

        await vault.flow(fund, account1, account1, 3)

        const start = await currentTime()
        await advanceTimeTo(start + 7)
        expect(await vault.getBalance(fund, account1)).to.equal(deposit)
        expect(await vault.getDesignatedBalance(fund, account1)).to.equal(21)
      })

      it("flows longer when lock is extended", async function () {
        setAutomine(true)

        await vault.flow(fund, account1, account2, 2)

        const start = await currentTime()
        await vault.extendLock(fund, maximum)

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
        ).to.be.revertedWithCustomError(vault, "VaultInsufficientBalance")
      })

      it("rejects total flows exceeding available tokens", async function () {
        await vault.flow(fund, account1, account2, 10)
        setAutomine(true)
        await expect(
          vault.flow(fund, account1, account2, 1)
        ).to.be.revertedWithCustomError(vault, "VaultInsufficientBalance")
      })

      it("cannot flow designated tokens", async function () {
        await vault.designate(fund, account1, 500)
        await vault.flow(fund, account1, account2, 5)
        setAutomine(true)
        await expect(
          vault.flow(fund, account1, account2, 1)
        ).to.be.revertedWithCustomError(vault, "VaultInsufficientBalance")
      })
    })

    describe("burning", function () {
      const dead = "0x000000000000000000000000000000000000dead"
      const amount = 1000

      let account1, account2, account3

      beforeEach(async function () {
        account1 = await vault.encodeAccountId(
          await holder.getAddress(),
          randomBytes(12)
        )
        account2 = await vault.encodeAccountId(
          await holder2.getAddress(),
          randomBytes(12)
        )
        account3 = await vault.encodeAccountId(
          await holder3.getAddress(),
          randomBytes(12)
        )
        await setAutomine(true)
        await token
          .connect(controller)
          .approve(await vault.getAddress(), amount)
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
          ).to.be.revertedWithCustomError(vault, "VaultInsufficientBalance")
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
            await holder.getAddress(),
            randomBytes(12)
          )
          await vault.transfer(fund, account1, account1a, 10)
          await vault.burnAccount(fund, account1)
          expect(await vault.getBalance(fund, account1a)).to.equal(10)
        })

        it("cannot burn tokens that are flowing", async function () {
          await vault.flow(fund, account1, account2, 5)
          const burning1 = vault.burnAccount(fund, account1)
          await expect(burning1).to.be.revertedWithCustomError(
            vault,
            "VaultFlowNotZero"
          )
          const burning2 = vault.burnAccount(fund, account2)
          await expect(burning2).to.be.revertedWithCustomError(
            vault,
            "VaultFlowNotZero"
          )
        })

        it("can burn tokens that are no longer flowing", async function () {
          await vault.flow(fund, account1, account2, 5)
          await vault.flow(fund, account2, account1, 5)
          await expect(vault.burnAccount(fund, account1)).not.to.be.reverted
        })
      })
    })

    describe("freezing", function () {
      const deposit = 1000

      let account1, account2, account3

      beforeEach(async function () {
        account1 = await vault.encodeAccountId(
          await holder.getAddress(),
          randomBytes(12)
        )
        account2 = await vault.encodeAccountId(
          await holder2.getAddress(),
          randomBytes(12)
        )
        account3 = await vault.encodeAccountId(
          await holder3.getAddress(),
          randomBytes(12)
        )
        await token.approve(await vault.getAddress(), deposit)
        await vault.deposit(fund, account1, deposit)
      })

      it("can freeze a fund", async function () {
        await setAutomine(true)
        await vault.freezeFund(fund)
        expect(await vault.getFundStatus(fund)).to.equal(FundStatus.Frozen)
      })

      it("stops all token flows", async function () {
        setAutomine(true)

        await vault.flow(fund, account1, account2, 10)
        await vault.flow(fund, account2, account3, 3)
        await mine()
        const start = await currentTime()
        await setNextBlockTimestamp(start + 10)
        await vault.freezeFund(fund)
        await mine()
        await advanceTimeTo(start + 20)
        expect(await vault.getBalance(fund, account1)).to.equal(deposit - 100)
        expect(await vault.getBalance(fund, account2)).to.equal(70)
        expect(await vault.getBalance(fund, account3)).to.equal(30)
      })
    })

    describe("withdrawing", function () {
      const amount = 1000

      let account1, account2

      beforeEach(async function () {
        account1 = await vault.encodeAccountId(
          await holder.getAddress(),
          randomBytes(12)
        )
        account2 = await vault.encodeAccountId(
          await holder2.getAddress(),
          randomBytes(12)
        )
        await setAutomine(true)
        await token
          .connect(controller)
          .approve(await vault.getAddress(), amount)
        await vault.deposit(fund, account1, amount)
      })

      it("does not allow withdrawal before lock expires", async function () {
        await setNextBlockTimestamp(expiry - 1)
        const withdrawing = vault.withdraw(fund, account1)
        await expect(withdrawing).to.be.revertedWithCustomError(
          vault,
          "VaultFundNotUnlocked"
        )
      })

      it("disallows withdrawal for everyone in the fund", async function () {
        await vault.transfer(fund, account1, account2, amount / 2)
        let withdrawing1 = vault.withdraw(fund, account1)
        let withdrawing2 = vault.withdraw(fund, account2)
        await expect(withdrawing1).to.be.revertedWithCustomError(
          vault,
          "VaultFundNotUnlocked"
        )
        await expect(withdrawing2).to.be.revertedWithCustomError(
          vault,
          "VaultFundNotUnlocked"
        )
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
      account1 = await vault.encodeAccountId(
        await holder.getAddress(),
        randomBytes(12)
      )
      account2 = await vault.encodeAccountId(
        await holder2.getAddress(),
        randomBytes(12)
      )
      account3 = await vault.encodeAccountId(
        await holder3.getAddress(),
        randomBytes(12)
      )
      await setAutomine(false)
      await setNextBlockTimestamp(beginning)
      await vault.lock(fund, expiry, maximum)
    })

    async function expire() {
      await setNextBlockTimestamp(expiry)
    }

    it("unlocks the funds", async function () {
      await mine()
      expect(await vault.getFundStatus(fund)).to.equal(FundStatus.Locked)
      await expire()
      await mine()
      expect(await vault.getFundStatus(fund)).to.equal(FundStatus.Withdrawing)
    })

    describe("locking", function () {
      beforeEach(async function () {
        await setAutomine(true)
      })

      it("cannot set lock when lock expired", async function () {
        await expire()
        const locking = vault.lock(fund, expiry, maximum)
        await expect(locking).to.be.revertedWithCustomError(
          vault,
          "VaultFundAlreadyLocked"
        )
      })

      it("cannot set lock when no tokens remain", async function () {
        await token.connect(controller).approve(await vault.getAddress(), 30)
        await vault.deposit(fund, account1, 30)
        await expire()
        await vault.withdraw(fund, account1)
        const locking = vault.lock(fund, expiry, maximum)
        await expect(locking).to.be.revertedWithCustomError(
          vault,
          "VaultFundAlreadyLocked"
        )
      })
    })

    describe("flowing", function () {
      const deposit = 1000

      beforeEach(async function () {
        await token
          .connect(controller)
          .approve(await vault.getAddress(), deposit)
        await vault.deposit(fund, account1, deposit)
      })

      describe("unlocked flows", function () {
        let total

        beforeEach(async function () {
          setAutomine(true)
          await vault.flow(fund, account1, account2, 2)
          const start = await currentTime()
          total = (expiry - start) * 2
          await advanceTimeTo(expiry)
        })

        it("stops flows when lock expires", async function () {
          let balance1, balance2
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
          const balance1Before = await token.balanceOf(
            await holder.getAddress()
          )
          const balance2Before = await token.balanceOf(
            await holder2.getAddress()
          )
          await vault.withdraw(fund, account1)
          await vault.withdraw(fund, account2)
          await mine()
          const balance1After = await token.balanceOf(await holder.getAddress())
          const balance2After = await token.balanceOf(
            await holder2.getAddress()
          )
          expect(balance1After - balance1Before).to.equal(deposit - total)
          expect(balance2After - balance2Before).to.equal(total)
        })
      })

      describe("unlocked frozen flows", function () {
        let total

        beforeEach(async function () {
          setAutomine(true)

          await vault.flow(fund, account1, account2, 2)

          const start = await currentTime()
          await setNextBlockTimestamp(start + 10)
          await vault.freezeFund(fund)

          const frozenAt = await currentTime()
          total = (frozenAt - start) * 2
          await advanceTimeTo(expiry)
        })

        it("stops flows at the time they were frozen", async function () {
          const balance1 = await vault.getBalance(fund, account1)
          const balance2 = await vault.getBalance(fund, account2)
          expect(balance1).to.equal(deposit - total)
          expect(balance2).to.equal(total)
        })

        it("allows frozen flows to be withdrawn", async function () {
          balance1Before = await token.balanceOf(await holder.getAddress())
          balance2Before = await token.balanceOf(await holder2.getAddress())
          await vault.withdraw(fund, account1)
          await vault.withdraw(fund, account2)

          balance1After = await token.balanceOf(await holder.getAddress())
          balance2After = await token.balanceOf(await holder2.getAddress())
          expect(balance1After - balance1Before).to.equal(deposit - total)
          expect(balance2After - balance2Before).to.equal(total)
        })
      })
    })

    describe("withdrawing", function () {
      const amount = 1000

      beforeEach(async function () {
        setAutomine(true)
        await token
          .connect(controller)
          .approve(await vault.getAddress(), amount)
        await vault.deposit(fund, account1, amount)
        await token
          .connect(controller)
          .approve(await vault.getAddress(), amount)
        await vault.deposit(fund, account2, amount)
      })

      it("allows controller to withdraw for a recipient", async function () {
        await expire()
        const before = await token.balanceOf(await holder.getAddress())
        await vault.withdraw(fund, account1)
        const after = await token.balanceOf(await holder.getAddress())
        expect(after - before).to.equal(amount)
      })

      it("allows account holder to withdraw for itself", async function () {
        await expire()
        const before = await token.balanceOf(await holder.getAddress())
        await vault
          .connect(holder)
          .withdrawByRecipient(await controller.getAddress(), fund, account1)
        const after = await token.balanceOf(await holder.getAddress())
        expect(after - before).to.equal(amount)
      })

      it("does not allow anyone else to withdraw for the account holder", async function () {
        await expire()
        await expect(
          vault
            .connect(holder2)
            .withdrawByRecipient(await controller.getAddress(), fund, account1)
        ).to.be.revertedWithCustomError(vault, "VaultOnlyAccountHolder")
      })

      it("empties the balance when withdrawing", async function () {
        await expire()
        await vault.withdraw(fund, account1)
        expect(await vault.getBalance(fund, account1)).to.equal(0)
      })

      it("does not withdraw other accounts from the same holder", async function () {
        const account1a = await vault.encodeAccountId(
          await holder.getAddress(),
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
        const before = await token.balanceOf(await holder.getAddress())
        await vault.withdraw(fund, account1)
        const after = await token.balanceOf(await holder.getAddress())
        expect(after - before).to.equal(amount)
      })

      it("does not withdraw designated tokens more than once", async function () {
        await vault.designate(fund, account1, 10)
        await expire()
        await vault.withdraw(fund, account1)
        const before = await token.balanceOf(await holder.getAddress())
        await vault.withdraw(fund, account1)
        const after = await token.balanceOf(await holder.getAddress())
        expect(after).to.equal(before)
      })

      it("can withdraw funds that were transfered in", async function () {
        await vault.transfer(fund, account1, account3, amount)
        await expire()
        const before = await token.balanceOf(await holder3.getAddress())
        await vault.withdraw(fund, account3)
        const after = await token.balanceOf(await holder3.getAddress())
        expect(after - before).to.equal(amount)
      })

      it("cannot withdraw funds that were transfered out", async function () {
        await vault.transfer(fund, account1, account3, amount)
        await expire()
        const before = await token.balanceOf(await holder.getAddress())
        await vault.withdraw(fund, account1)
        const after = await token.balanceOf(await holder.getAddress())
        expect(after).to.equal(before)
      })

      it("cannot withdraw more than once", async function () {
        await expire()
        await vault.withdraw(fund, account1)
        const before = await token.balanceOf(await holder.getAddress())
        await vault.withdraw(fund, account1)
        const after = await token.balanceOf(await holder.getAddress())
        expect(after).to.equal(before)
      })

      it("cannot withdraw burned tokens", async function () {
        await vault.burnAccount(fund, account1)
        await expire()
        const before = await token.balanceOf(await holder.getAddress())
        await vault.withdraw(fund, account1)
        const after = await token.balanceOf(await holder.getAddress())
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

  describe("when a fund is frozen", function () {
    const amount = 1000

    let expiry
    let account

    beforeEach(async function () {
      expiry = (await currentTime()) + 100
      account = await vault.encodeAccountId(
        await holder.getAddress(),
        randomBytes(12)
      )
      await token.connect(controller).approve(await vault.getAddress(), amount)
      await vault.lock(fund, expiry, expiry)
      await vault.deposit(fund, account, amount)
      await vault.freezeFund(fund)
    })

    it("does not allow setting a lock", async function () {
      const locking = vault.lock(fund, expiry, expiry)
      await expect(locking).to.be.revertedWithCustomError(
        vault,
        "VaultFundAlreadyLocked"
      )
    })

    it("does not allow withdrawal", async function () {
      const withdrawing = vault.withdraw(fund, account)
      await expect(withdrawing).to.be.revertedWithCustomError(
        vault,
        "VaultFundNotUnlocked"
      )
    })

    it("unlocks when the lock expires", async function () {
      await advanceTimeTo(expiry)
      expect(await vault.getFundStatus(fund)).to.equal(FundStatus.Withdrawing)
    })

    testFundThatIsNotLocked()
  })

  function testFundThatIsNotLocked() {
    let account, account2

    beforeEach(async function () {
      account = await vault.encodeAccountId(
        await holder.getAddress(),
        randomBytes(12)
      )
      account2 = await vault.encodeAccountId(
        await holder2.getAddress(),
        randomBytes(12)
      )
    })

    it("does not allow extending of lock", async function () {
      await expect(
        vault.extendLock(fund, (await currentTime()) + 1)
      ).to.be.revertedWithCustomError(vault, "VaultFundNotLocked")
    })

    it("does not allow depositing of tokens", async function () {
      const amount = 1000
      await token.connect(controller).approve(await vault.getAddress(), amount)
      await expect(
        vault.deposit(fund, account, amount)
      ).to.be.revertedWithCustomError(vault, "VaultFundNotLocked")
    })

    it("does not allow designating tokens", async function () {
      await expect(
        vault.designate(fund, account, 0)
      ).to.be.revertedWithCustomError(vault, "VaultFundNotLocked")
    })

    it("does not allow transfer of tokens", async function () {
      await expect(
        vault.transfer(fund, account, account2, 0)
      ).to.be.revertedWithCustomError(vault, "VaultFundNotLocked")
    })

    it("does not allow new token flows to start", async function () {
      await expect(
        vault.flow(fund, account, account2, 0)
      ).to.be.revertedWithCustomError(vault, "VaultFundNotLocked")
    })

    it("does not allow burning of designated tokens", async function () {
      await expect(
        vault.burnDesignated(fund, account, 1)
      ).to.be.revertedWithCustomError(vault, "VaultFundNotLocked")
    })

    it("does not allow burning of accounts", async function () {
      await expect(
        vault.burnAccount(fund, account)
      ).to.be.revertedWithCustomError(vault, "VaultFundNotLocked")
    })

    it("does not allow freezing of a fund", async function () {
      await expect(vault.freezeFund(fund)).to.be.revertedWithCustomError(
        vault,
        "VaultFundNotLocked"
      )
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
      await expect(vault.connect(other).pause()).to.be.revertedWithCustomError(
        vault,
        "OwnableUnauthorizedAccount"
      )
    })

    it("does not allow unpause to be called by others", async function () {
      await vault.connect(owner).pause()
      await expect(
        vault.connect(other).unpause()
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount")
    })

    it("allows the ownership to change", async function () {
      await vault.connect(owner).pause()
      await vault.connect(owner).transferOwnership(await owner2.getAddress())
      await expect(vault.connect(owner2).unpause()).not.to.be.reverted
    })

    it("allows the ownership to be renounced", async function () {
      await vault.connect(owner).renounceOwnership()
      await expect(vault.connect(owner).pause()).to.be.revertedWithCustomError(
        vault,
        "OwnableUnauthorizedAccount"
      )
    })

    describe("when the vault is paused", function () {
      let expiry
      let maximum
      let account1, account2

      beforeEach(async function () {
        expiry = (await currentTime()) + 80
        maximum = (await currentTime()) + 100
        account1 = await vault.encodeAccountId(
          await holder.getAddress(),
          randomBytes(12)
        )
        account2 = await vault.encodeAccountId(
          await holder2.getAddress(),
          randomBytes(12)
        )
        await vault.lock(fund, expiry, maximum)
        await token.approve(await vault.getAddress(), 1000)
        await vault.deposit(fund, account1, 1000)
        await vault.designate(fund, account1, 100)
        await vault.connect(owner).pause()
      })

      it("only allows a recipient to withdraw itself", async function () {
        await advanceTimeTo(expiry)
        await expect(
          vault
            .connect(holder)
            .withdrawByRecipient(await controller.getAddress(), fund, account1)
        ).not.to.be.reverted
      })

      it("does not allow funds to be locked", async function () {
        const fund = randomBytes(32)
        const expiry = (await currentTime()) + 100
        await expect(
          vault.lock(fund, expiry, expiry)
        ).to.be.revertedWithCustomError(vault, "EnforcedPause")
      })

      it("does not allow extending of lock", async function () {
        await expect(
          vault.extendLock(fund, maximum)
        ).to.be.revertedWithCustomError(vault, "EnforcedPause")
      })

      it("does not allow depositing of tokens", async function () {
        await token.approve(await vault.getAddress(), 100)
        await expect(
          vault.deposit(fund, account1, 100)
        ).to.be.revertedWithCustomError(vault, "EnforcedPause")
      })

      it("does not allow designating tokens", async function () {
        await expect(
          vault.designate(fund, account1, 10)
        ).to.be.revertedWithCustomError(vault, "EnforcedPause")
      })

      it("does not allow transfer of tokens", async function () {
        await expect(
          vault.transfer(fund, account1, account2, 10)
        ).to.be.revertedWithCustomError(vault, "EnforcedPause")
      })

      it("does not allow new token flows to start", async function () {
        await expect(
          vault.flow(fund, account1, account2, 1)
        ).to.be.revertedWithCustomError(vault, "EnforcedPause")
      })

      it("does not allow burning of designated tokens", async function () {
        await expect(
          vault.burnDesignated(fund, account1, 10)
        ).to.be.revertedWithCustomError(vault, "EnforcedPause")
      })

      it("does not allow burning of accounts", async function () {
        await expect(
          vault.burnAccount(fund, account1)
        ).to.be.revertedWithCustomError(vault, "EnforcedPause")
      })

      it("does not allow freezing of funds", async function () {
        await expect(vault.freezeFund(fund)).to.be.revertedWithCustomError(
          vault,
          "EnforcedPause"
        )
      })

      it("does not allow a controller to withdraw for a recipient", async function () {
        await advanceTimeTo(expiry)
        await expect(
          vault.withdraw(fund, account1)
        ).to.be.revertedWithCustomError(vault, "EnforcedPause")
      })
    })
  })

  describe("bugs", function () {
    it("does not allow flows to survive fund id reuse", async function () {
      // bug discovered and reported by Aleksander and Jochen from Certora
      async function reproduceBug() {
        const account1 = await vault.encodeAccountId(
          holder.address,
          randomBytes(12)
        )
        const account2 = await vault.encodeAccountId(
          holder.address,
          randomBytes(12)
        )
        const expiry1 = (await currentTime()) + 10
        const expiry2 = (await currentTime()) + 20

        // store tokens in fund
        await token.connect(controller).approve(vault.address, 100)
        await vault.lock(fund, expiry1, expiry1)
        await vault.deposit(fund, account1, 100)

        // initiate a flow, and immediately freeze it
        await vault.flow(fund, account1, account2, 1)
        await vault.freezeFund(fund)

        // only withdraw from flow sender
        await advanceTimeTo(expiry1)
        expect(await vault.getBalance(fund, account1)).to.equal(100)
        await vault.withdraw(fund, account1)

        // reuse fund id
        await vault.lock(fund, expiry2, expiry2)
        await advanceTimeTo(expiry2)

        // bug: this balance is positive, because the flow was not reset
        expect(await vault.getBalance(fund, account2)).to.equal(20)
      }

      // bug is fixed by no longer allowing reuse of fund ids
      await expect(reproduceBug()).to.be.revertedWith("VaultFundAlreadyLocked")
    })
  })
})
