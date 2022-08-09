const { ethers } = require("hardhat")
const { expect } = require("chai")
const { hexlify, randomBytes, toHexString } = ethers.utils
const { advanceTimeTo, snapshot, revert } = require("./evm")
const { exampleLock } = require("./examples")
const { now, hours } = require("./time")
const { waitUntilExpired } = require("./marketplace")

describe("Account Locks", function () {
  let locks

  beforeEach(async function () {
    let AccountLocks = await ethers.getContractFactory("TestAccountLocks")
    locks = await AccountLocks.deploy()
  })

  describe("creating a lock", function () {
    it("allows creation of a lock with an expiry time", async function () {
      let { id, expiry } = exampleLock()
      await locks.createLock(id, expiry)
    })

    it("fails to create a lock with an existing id", async function () {
      let { id, expiry } = exampleLock()
      await locks.createLock(id, expiry)
      await expect(locks.createLock(id, expiry + 1)).to.be.revertedWith(
        "Lock already exists"
      )
    })
  })

  describe("locking an account", function () {
    let lock

    beforeEach(async function () {
      lock = exampleLock()
      await locks.createLock(lock.id, lock.expiry)
    })

    it("locks an account", async function () {
      let [account] = await ethers.getSigners()
      await locks.lock(account.address, lock.id)
    })

    it("fails to lock account when lock does not exist", async function () {
      let [account] = await ethers.getSigners()
      let nonexistent = exampleLock().id
      await expect(locks.lock(account.address, nonexistent)).to.be.revertedWith(
        "Lock does not exist"
      )
    })
  })

  describe("unlocking a lock", function () {
    let lock

    beforeEach(async function () {
      lock = exampleLock()
      await locks.createLock(lock.id, lock.expiry)
    })

    it("unlocks a lock", async function () {
      await locks.unlock(lock.id)
    })

    it("fails to unlock a lock that does not exist", async function () {
      let nonexistent = exampleLock().id
      await expect(locks.unlock(nonexistent)).to.be.revertedWith(
        "Lock does not exist"
      )
    })

    it("fails to unlock by someone other than the creator", async function () {
      let [_, other] = await ethers.getSigners()
      await expect(locks.connect(other).unlock(lock.id)).to.be.revertedWith(
        "Only lock creator can unlock"
      )
    })
  })

  describe("unlocking an account", function () {
    it("unlocks an account that has not been locked", async function () {
      await locks.unlockAccount()
    })

    it("unlocks an account whose locks have been unlocked", async function () {
      let [account] = await ethers.getSigners()
      let lock = exampleLock()
      await locks.createLock(lock.id, lock.expiry)
      await locks.lock(account.address, lock.id)
      await locks.unlock(lock.id)
      await locks.unlockAccount()
    })

    it("unlocks an account whose locks have expired", async function () {
      let [account] = await ethers.getSigners()
      let lock = { ...exampleLock(), expiry: now() }
      await locks.createLock(lock.id, lock.expiry)
      await locks.lock(account.address, lock.id)
      await locks.unlockAccount()
    })

    it("unlocks multiple accounts tied to the same lock", async function () {
      let [account0, account1] = await ethers.getSigners()
      let lock = exampleLock()
      await locks.createLock(lock.id, lock.expiry)
      await locks.lock(account0.address, lock.id)
      await locks.lock(account1.address, lock.id)
      await locks.unlock(lock.id)
      await locks.connect(account0).unlockAccount()
      await locks.connect(account1).unlockAccount()
    })

    it("fails to unlock when some locks are still locked", async function () {
      let [account] = await ethers.getSigners()
      let [lock1, lock2] = [exampleLock(), exampleLock()]
      await locks.createLock(lock1.id, lock1.expiry)
      await locks.createLock(lock2.id, lock2.expiry)
      await locks.lock(account.address, lock1.id)
      await locks.lock(account.address, lock2.id)
      await locks.unlock(lock1.id)
      await expect(locks.unlockAccount()).to.be.revertedWith("Account locked")
    })
  })

  describe("limits", function () {
    let maxlocks
    let account

    beforeEach(async function () {
      maxlocks = await locks.MAX_LOCKS_PER_ACCOUNT()
      ;[account] = await ethers.getSigners()
    })

    async function addLock() {
      let { id, expiry } = exampleLock()
      await locks.createLock(id, expiry)
      await locks.lock(account.address, id)
      return id
    }

    it("supports a limited amount of locks per account", async function () {
      for (let i = 0; i < maxlocks; i++) {
        await addLock()
      }
      await expect(addLock()).to.be.revertedWith("Max locks reached")
    })

    it("doesn't count unlocked locks towards the limit", async function () {
      for (let i = 0; i < maxlocks; i++) {
        let id = await addLock()
        await locks.unlock(id)
      }
      await expect(addLock()).not.to.be.reverted
    })

    it("handles maximum amount of locks within gas limit", async function () {
      let ids = []
      for (let i = 0; i < maxlocks; i++) {
        ids.push(await addLock())
      }
      for (let id of ids) {
        await locks.unlock(id)
      }
      await locks.unlockAccount()
    })
  })

  describe("extend lock expiry", function () {
    let expiry
    let id

    beforeEach(async function () {
      await snapshot()

      let lock = exampleLock()
      id = lock.id
      expiry = lock.expiry
      await locks.createLock(id, expiry)
      let [account] = await ethers.getSigners()
      await locks.lock(account.address, id)
    })

    afterEach(async function () {
      await revert()
    })

    it("fails when lock id doesn't exist", async function () {
      let other = exampleLock()
      await expect(
        locks.extendLockExpiry(other.id, hours(1))
      ).to.be.revertedWith("Lock does not exist")
    })

    it("fails when lock is already expired", async function () {
      waitUntilExpired(expiry + hours(1))
      await expect(locks.extendLockExpiry(id, hours(1))).to.be.revertedWith(
        "Lock already expired"
      )
    })

    it("successfully updates lock expiry", async function () {
      await expect(locks.extendLockExpiry(id, hours(1))).not.to.be.reverted
    })
  })
})
