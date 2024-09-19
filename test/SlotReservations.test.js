const { expect } = require("chai")
const { ethers } = require("hardhat")
const { exampleRequest } = require("./examples")
const { requestId, slotId } = require("./ids")

describe("SlotReservations", function () {
  let reservations
  let provider, address1, address2, address3
  let request
  let slot
  let id // can't use slotId because it'll shadow the function slotId

  beforeEach(async function () {
    let SlotReservations = await ethers.getContractFactory(
      "TestSlotReservations"
    )
    reservations = await SlotReservations.deploy()
    ;[provider, address1, address2, address3] = await ethers.getSigners()

    request = await exampleRequest()

    slot = {
      request: requestId(request),
      index: request.ask.slots / 2,
    }

    id = slotId(slot)
  })

  function switchAccount(account) {
    reservations = reservations.connect(account)
  }

  it("allows a slot to be reserved", async function () {
    expect(reservations.reserveSlot(id)).to.not.be.reverted
  })

  it("contains the correct addresses after reservation", async function () {
    await reservations.reserveSlot(id)
    expect(await reservations.contains(id, provider.address)).to.be.true

    switchAccount(address1)
    await reservations.reserveSlot(id)
    expect(await reservations.contains(id, address1.address)).to.be.true
  })

  it("has the correct number of addresses after reservation", async function () {
    await reservations.reserveSlot(id)
    expect(await reservations.length(id)).to.equal(1)

    switchAccount(address1)
    await reservations.reserveSlot(id)
    expect(await reservations.length(id)).to.equal(2)
  })

  it("reports a slot can be reserved", async function () {
    expect(await reservations.canReserveSlot(slotId(slot))).to.be.true
  })

  it("cannot reserve a slot more than once", async function () {
    await reservations.reserveSlot(id)
    await expect(reservations.reserveSlot(id)).to.be.revertedWith(
      "Reservation not allowed"
    )
    expect(await reservations.length(id)).to.equal(1)
  })

  it("reports a slot cannot be reserved if already reserved", async function () {
    await reservations.reserveSlot(id)
    expect(await reservations.canReserveSlot(id)).to.be.false
  })

  it("cannot reserve a slot if reservations are at capacity", async function () {
    switchAccount(address1)
    await reservations.reserveSlot(id)
    switchAccount(address2)
    await reservations.reserveSlot(id)
    switchAccount(address3)
    await reservations.reserveSlot(id)
    switchAccount(provider)
    await expect(reservations.reserveSlot(id)).to.be.revertedWith(
      "Reservation not allowed"
    )
    expect(await reservations.length(id)).to.equal(3)
    expect(await reservations.contains(id, provider.address)).to.be.false
  })

  it("reports a slot cannot be reserved if reservations are at capacity", async function () {
    switchAccount(address1)
    await reservations.reserveSlot(id)
    switchAccount(address2)
    await reservations.reserveSlot(id)
    switchAccount(address3)
    await reservations.reserveSlot(id)
    switchAccount(provider)
    expect(await reservations.canReserveSlot(id)).to.be.false
  })
})
