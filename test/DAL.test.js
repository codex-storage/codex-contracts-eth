const { ethers } = require("hardhat")
const { expect, Assertion } = require("chai")
const { hexlify, randomBytes } = ethers.utils
const { exampleAddress, exampleRequest, zeroBytesHex } = require("./examples")
const { slotId, requestId, requestToArray, askToArray } = require("./ids")
const { BigNumber } = ethers
const { supportDAL } = require("./dal")

supportDAL(Assertion)

describe("DAL", function () {
  let account
  let contract
  let request
  let slot
  let host
  let client

  describe("Database", function () {
    beforeEach(async function () {
      let DAL = await ethers.getContractFactory("TestDAL")
      contract = await DAL.deploy()
      ;[account] = await ethers.getSigners()
      request = await exampleRequest()
      request.id = requestId(request)
      request.slots = []
      client = {
        id: await exampleAddress(),
        requests: [],
      }
      request.client = client.id
      host = {
        id: await exampleAddress(),
        requests: [],
        slots: [],
      }
      slot = {
        id: slotId({ request: request.id, index: 0 }),
        host: host.id,
        hostPaid: false,
        requestId: request.id,
      }
    })

    describe("Create: successful", function () {
      it("inserts a request", async function () {
        await expect(await contract.requestExists(request.id)).to.be.false
        await contract.insertClient(client.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await expect(await contract.requestExists(request.id)).to.be.true
      })

      it("inserts a slot", async function () {
        await expect(await contract.slotExists(slot.id)).to.be.false
        await contract.insertClient(client.id)
        await contract.insertHost(host.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await contract.insertSlot(slot)
        await expect(await contract.slotExists(slot.id)).to.be.true
      })

      it("inserts a client", async function () {
        await expect(await contract.clientExists(client.id)).to.be.false
        await contract.insertClient(client.id)
        await expect(await contract.clientExists(client.id)).to.be.true
      })

      it("inserts a host", async function () {
        await expect(await contract.hostExists(host.id)).to.be.false
        await contract.insertHost(host.id)
        await expect(await contract.hostExists(host.id)).to.be.true
      })

      it("inserts a host request", async function () {
        await contract.insertClient(client.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await contract.insertHost(host.id)
        await contract.insertHostRequest(host.id, request.id)
        let [id, slots, requests] = await contract.selectHost(host.id)
        await expect(requests.includes(request.id)).to.be.true
      })

      it("inserts a client request", async function () {
        await contract.insertClient(client.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await contract.insertClientRequest(client.id, request.id)
        let [id, requests] = await contract.selectClient(client.id)
        await expect(requests.includes(request.id)).to.be.true
      })

      it("inserts a host slot", async function () {
        await contract.insertClient(client.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await contract.insertHost(host.id)
        await contract.insertHostRequest(host.id, request.id)
        await contract.insertSlot(slot)
        await contract.insertHostSlot(host.id, slot.id)
        let [id, slots, requests] = await contract.selectHost(host.id)
        await expect(slots.includes(slot.id)).to.be.true
      })
    })

    describe("Create: failure", function () {
      it("fails to insert a request when request id not provided", async function () {
        await expect(await contract.requestExists(request.id)).to.be.false
        await expect(
          contract.insertRequest(
            zeroBytesHex(32),
            request.client,
            request.ask,
            request.content,
            request.expiry,
            request.nonce
          )
        ).to.be.revertedWith("request id required")
      })
      it("fails to insert a request when client id (address) not provided", async function () {
        await expect(await contract.requestExists(request.id)).to.be.false
        await expect(
          contract.insertRequest(
            request.id,
            zeroBytesHex(20),
            request.ask,
            request.content,
            request.expiry,
            request.nonce
          )
        ).to.be.revertedWith("client address required")
      })
      it("fails to insert a request when client doesn't exist", async function () {
        await expect(await contract.requestExists(request.id)).to.be.false
        await expect(
          contract.insertRequest(
            request.id,
            request.client,
            request.ask,
            request.content,
            request.expiry,
            request.nonce
          )
        ).to.be.revertedWith("client does not exist")
      })
      it("fails to insert a request when request already exists", async function () {
        await expect(await contract.requestExists(request.id)).to.be.false
        await contract.insertClient(client.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await expect(
          contract.insertRequest(
            request.id,
            request.client,
            request.ask,
            request.content,
            request.expiry,
            request.nonce
          )
        ).to.be.revertedWith("request already exists")
      })
      it("fails to insert a slot when slot id not provided", async function () {
        await expect(await contract.requestExists(request.id)).to.be.false
        slot.id = zeroBytesHex(32)
        await expect(contract.insertSlot(slot)).to.be.revertedWith(
          "slot id required"
        )
      })
      it("fails to insert a slot when request id not provided", async function () {
        await expect(await contract.requestExists(request.id)).to.be.false
        slot.requestId = zeroBytesHex(32)
        await expect(contract.insertSlot(slot)).to.be.revertedWith(
          "request id required"
        )
      })
      it("fails to insert a slot when request id not provided", async function () {
        await expect(await contract.requestExists(request.id)).to.be.false
        slot.requestId = zeroBytesHex(32)
        await expect(contract.insertSlot(slot)).to.be.revertedWith(
          "request id required"
        )
      })
      it("fails to insert a slot when request doesn't exist", async function () {
        await expect(await contract.requestExists(request.id)).to.be.false
        await expect(contract.insertSlot(slot)).to.be.revertedWith(
          "request does not exist"
        )
      })
      it("fails to insert a slot when the slot already exists", async function () {
        await expect(await contract.requestExists(request.id)).to.be.false
        await contract.insertClient(client.id)
        await contract.insertHost(host.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await contract.insertSlot(slot)
        await expect(contract.insertSlot(slot)).to.be.revertedWith(
          "slot already exists"
        )
      })
      it("fails to insert a slot when the host does not exist", async function () {
        await expect(await contract.requestExists(request.id)).to.be.false
        await contract.insertClient(client.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await expect(contract.insertSlot(slot)).to.be.revertedWith(
          "host does not exist"
        )
      })
      it("fails to insert a client when the client already exists", async function () {
        await contract.insertClient(client.id)
        await expect(contract.insertClient(client.id)).to.be.revertedWith(
          "client already exists"
        )
      })
      it("fails to insert a client when the address wasn't provided", async function () {
        client.id = zeroBytesHex(20)
        await expect(contract.insertClient(client.id)).to.be.revertedWith(
          "address required"
        )
      })
      it("fails to insert a host when the host already exists", async function () {
        await contract.insertHost(host.id)
        await expect(contract.insertHost(host.id)).to.be.revertedWith(
          "host already exists"
        )
      })
      it("fails to insert a host when the address wasn't provided", async function () {
        host.id = zeroBytesHex(20)
        await expect(contract.insertHost(host.id)).to.be.revertedWith(
          "address required"
        )
      })
      it("fails to insert a host request when request doesn't exist", async function () {
        await contract.insertHost(host.id)
        await expect(
          contract.insertHostRequest(host.id, request.id)
        ).to.be.revertedWith("request does not exist")
      })
      it("fails to insert a client request when request doesn't exist", async function () {
        await contract.insertClient(client.id)
        await expect(
          contract.insertClientRequest(client.id, request.id)
        ).to.be.revertedWith("request does not exist")
      })

      it("fails to insert a host slot when slot doesn't exist", async function () {
        await contract.insertClient(client.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await contract.insertHost(host.id)
        await expect(
          contract.insertHostSlot(host.id, slot.id)
        ).to.be.revertedWith("slot does not exist")
      })

      it("fails to insert a host slot when host doesn't exist", async function () {
        await contract.insertClient(client.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await expect(
          contract.insertHostSlot(host.id, slot.id)
        ).to.be.revertedWith("Host does not exist")
      })

      it("fails to insert a host slot when the host request doesn't exist", async function () {
        await contract.insertClient(client.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await contract.insertHost(host.id)
        await contract.insertSlot(slot)
        await expect(
          contract.insertHostSlot(host.id, slot.id)
        ).to.be.revertedWith("slot request not active")
      })
    })

    describe("Read: success", function () {
      it("selects a request", async function () {
        await contract.insertClient(client.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await expect(await contract.selectRequest(request.id)).to.equalsRequest(
          request
        )
      })
      it("selects a slot", async function () {
        await contract.insertClient(client.id)
        await contract.insertHost(host.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await contract.insertSlot(slot)
        await expect(await contract.selectSlot(slot.id)).to.equalsSlot(slot)
      })
      it("selects a client", async function () {
        await contract.insertClient(client.id)
        await expect(await contract.selectClient(client.id)).to.be.equalsClient(
          client
        )
      })
      it("selects a host", async function () {
        await contract.insertHost(host.id)
        await expect(await contract.selectHost(host.id)).to.be.equalsHost(host)
      })
    })

    describe("Read: failure", function () {
      it("fails to select a request when request doesn't exist", async function () {
        await expect(contract.selectRequest(request.id)).to.be.revertedWith(
          "Unknown request"
        )
      })
      it("fails to select a slot when slot is empty", async function () {
        await expect(contract.selectSlot(slot.id)).to.be.revertedWith(
          "Slot empty"
        )
      })
      it("fails to select a client when client doesn't exist", async function () {
        await expect(contract.selectClient(client.id)).to.be.revertedWith(
          "Client does not exist"
        )
      })
      it("fails to select a host when host doesn't exist", async function () {
        await expect(contract.selectHost(host.id)).to.be.revertedWith(
          "Host does not exist"
        )
      })
    })

    describe("Delete: success", function () {
      it("deletes a request", async function () {
        await contract.insertClient(client.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await contract.removeRequest(request.id)
        await expect(contract.selectRequest(request.id)).to.be.revertedWith(
          "Unknown request"
        )
      })
      it("deletes a slot", async function () {
        await contract.insertClient(client.id)
        await contract.insertHost(host.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await contract.insertSlot(slot)
        await contract.removeSlot(slot.id)
        await expect(contract.selectSlot(slot.id)).to.be.revertedWith(
          "Slot empty"
        )
      })
      it("deletes a client", async function () {
        await contract.insertClient(client.id)
        await contract.removeClient(client.id)
        await expect(contract.selectClient(client.id)).to.be.revertedWith(
          "Client does not exist"
        )
      })
      it("deletes a host", async function () {
        await contract.insertHost(host.id)
        await contract.removeHost(host.id)
        await expect(contract.selectHost(host.id)).to.be.revertedWith(
          "Host does not exist"
        )
      })
      it("deletes a client request", async function () {
        await contract.insertClient(client.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await contract.insertClientRequest(client.id, request.id)
        let [id, requests] = await contract.selectClient(client.id)
        await expect(requests.length).to.equal(1)
        await contract.removeClientRequest(client.id, request.id)
        ;[id, requests] = await contract.selectClient(client.id)
        await expect(requests.length).to.equal(0)
      })
      it("deletes a host request", async function () {
        await contract.insertClient(client.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await contract.insertHost(host.id)
        await contract.insertHostRequest(host.id, request.id)
        let [id, slots, requests] = await contract.selectHost(host.id)
        await expect(requests.length).to.equal(1)
        await contract.removeHostRequest(host.id, request.id)
        ;[id, slots, requests] = await contract.selectHost(host.id)
        await expect(requests.length).to.equal(0)
      })
      it("deletes a host slot", async function () {
        await contract.insertClient(client.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await contract.insertHost(host.id)
        await contract.insertHostRequest(host.id, request.id)
        await contract.insertSlot(slot)
        await contract.insertHostSlot(host.id, slot.id)
        let [id, slots, requests] = await contract.selectHost(host.id)
        await expect(slots.length).to.equal(1)
        await contract.removeHostSlot(host.id, slot.id)
        ;[id, slots, requests] = await contract.selectHost(host.id)
        await expect(slots.length).to.equal(0)
      })
    })

    describe("Delete: failure", function () {
      it("fails to delete a request when it references slots", async function () {
        await contract.insertClient(client.id)
        await contract.insertHost(host.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await contract.insertSlot(slot)
        await expect(contract.removeRequest(request.id)).to.be.revertedWith(
          "references slots"
        )
      })
      it("fails to delete a request when its client has request references", async function () {
        await contract.insertClient(client.id)
        await contract.insertHost(host.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await contract.insertClientRequest(client.id, request.id)
        await expect(contract.removeRequest(request.id)).to.be.revertedWith(
          "active request refs"
        )
      })
      it("fails to delete a client when it has request references", async function () {
        await contract.insertClient(client.id)
        await contract.insertHost(host.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await contract.insertClientRequest(client.id, request.id)
        await expect(contract.removeClient(client.id)).to.be.revertedWith(
          "active request refs"
        )
      })
      it("fails to delete a request when its host has slot references", async function () {
        await contract.insertClient(client.id)
        await contract.insertHost(host.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await contract.insertSlot(slot)
        await contract.insertHostRequest(host.id, request.id)
        await contract.insertHostSlot(host.id, slot.id)
        await expect(contract.removeSlot(slot.id)).to.be.revertedWith(
          "active slot refs"
        )
      })
      it("fails to delete a host when it has slot references", async function () {
        await contract.insertClient(client.id)
        await contract.insertHost(host.id)
        await contract.insertRequest(
          request.id,
          request.client,
          request.ask,
          request.content,
          request.expiry,
          request.nonce
        )
        await contract.insertSlot(slot)
        await contract.insertHostRequest(host.id, request.id)
        await contract.insertHostSlot(host.id, slot.id)
        await expect(contract.removeHost(host.id)).to.be.revertedWith(
          "active slot refs"
        )
      })
    })
  })
})
