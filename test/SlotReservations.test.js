const { expect } = require("chai")
const { ethers } = require("hardhat")
const { exampleRequest, exampleAddress } = require("./examples")
const { requestId, slotId } = require("./ids")

describe("SlotReservations", function () {
  let reservations
  let provider, address1, address2, address3
  let request
  let slot

  beforeEach(async function () {
    let SlotReservations = await ethers.getContractFactory("SlotReservations")
    reservations = await SlotReservations.deploy()

    provider = exampleAddress()
    address1 = exampleAddress()
    address2 = exampleAddress()
    address3 = exampleAddress()

    request = await exampleRequest()
    request.client = exampleAddress()

    slot = {
      request: requestId(request),
      index: request.ask.slots / 2,
    }
  })

  it("allows a slot to be reserved", async function () {
    let reserved = await reservations.callStatic.reserveSlot(
      slotId(slot),
      provider
    )
    expect(reserved).to.be.true
  })

  it("reports a slot can be reserved", async function () {
    expect(await reservations.canReserveSlot(slotId(slot), provider)).to.be.true
  })

  it("cannot reserve a slot more than once", async function () {
    let id = slotId(slot)
    await reservations.reserveSlot(id, provider)
    await expect(reservations.reserveSlot(id, provider)).to.be.revertedWith(
      "Reservation not allowed"
    )
  })

  it("reports a slot cannot be reserved if already reserved", async function () {
    let id = slotId(slot)
    await reservations.reserveSlot(id, provider)
    expect(await reservations.canReserveSlot(id, provider)).to.be.false
  })

  it("cannot reserve a slot if reservations are at capacity", async function () {
    let id = slotId(slot)
    await reservations.reserveSlot(id, address1)
    await reservations.reserveSlot(id, address2)
    await reservations.reserveSlot(id, address3)
    await expect(reservations.reserveSlot(id, provider)).to.be.revertedWith(
      "Reservation not allowed"
    )
  })

  it("reports a slot cannot be reserved if reservations are at capacity", async function () {
    let id = slotId(slot)
    await reservations.reserveSlot(id, address1)
    await reservations.reserveSlot(id, address2)
    await reservations.reserveSlot(id, address3)
    expect(await reservations.canReserveSlot(id, provider)).to.be.false
  })
})
