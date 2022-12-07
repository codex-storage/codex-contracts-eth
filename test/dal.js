const { BigNumber } = require("ethers")
const { hexlify } = ethers.utils

function isBigNumberish(bn) {
  return bn._isBigNumber === true
}

function normalizeBn(bn) {
  return isBigNumberish(bn) ? bn.toNumber() : bn
}

function supportDAL(Assertion) {
  Assertion.addMethod("equalsRequest", function (request) {
    const evmRequest = requestFromArray(this._obj)
    request.content.por.u = hexlify(request.content.por.u)
    request.content.por.publicKey = hexlify(request.content.por.publicKey)
    request.content.por.name = hexlify(request.content.por.name)
    new Assertion(evmRequest).to.deep.equal(request)
  })
  Assertion.addMethod("equalsSlot", function (slot) {
    const evmSlot = slotFromArray(this._obj)
    new Assertion(evmSlot).to.deep.equal(slot)
  })
  Assertion.addMethod("equalsClient", function (client) {
    const evmClient = clientFromArray(this._obj)
    new Assertion(evmClient).to.deep.equal(client)
  })
  Assertion.addMethod("equalsHost", function (host) {
    const evmHost = hostFromArray(this._obj)
    new Assertion(evmHost).to.deep.equal(host)
  })
}

function parse(keys, object) {
  let obj = {}
  keys.forEach((key, i) => (obj[key] = normalizeBn(object[i])))
  return obj
}

function porFromArray(por) {
  return {
    u: por.u,
    publicKey: por.publicKey,
    name: por.name,
  }
}

function erasureFromArray(erasure) {
  return {
    totalChunks: normalizeBn(erasure.totalChunks),
  }
}

function contentFromArray(ask) {
  return {
    cid: ask.cid,
    erasure: erasureFromArray(ask.erasure),
    por: porFromArray(ask.por),
  }
}

function askFromArray(ask) {
  return {
    slots: normalizeBn(ask.slots),
    slotSize: normalizeBn(ask.slotSize),
    duration: normalizeBn(ask.duration),
    proofProbability: normalizeBn(ask.proofProbability),
    reward: normalizeBn(ask.reward),
    maxSlotLoss: normalizeBn(ask.maxSlotLoss),
  }
}

function requestFromArray(request) {
  return {
    id: request[0],
    client: request[1],
    ask: askFromArray(request[2]),
    content: contentFromArray(request[3]),
    expiry: normalizeBn(request[4]),
    nonce: request[5],
    slots: normalizeBn(request[6]),
  }
}

function slotFromArray(slot) {
  return {
    id: slot[0],
    host: slot[1],
    hostPaid: slot[2],
    requestId: slot[3],
  }
}

function clientFromArray(client) {
  return {
    id: client[0],
    requests: client[1],
  }
}

function hostFromArray(host) {
  return {
    id: host[0],
    slots: host[1],
    requests: host[2],
  }
}

module.exports = {
  supportDAL,
}
