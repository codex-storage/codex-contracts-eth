const { ethers } = require("hardhat")
const { keccak256, defaultAbiCoder } = ethers.utils

function requestId(request) {
  const Ask = "tuple(uint256, uint256, uint256, uint256)"
  const Erasure = "tuple(uint64, uint64)"
  const PoR = "tuple(bytes, bytes, bytes)"
  const Content = "tuple(string, " + Erasure + ", " + PoR + ")"
  const Request =
    "tuple(address, " + Ask + ", " + Content + ", uint256, bytes32)"
  return keccak256(defaultAbiCoder.encode([Request], requestToArray(request)))
}

function askToArray(ask) {
  return [ask.size, ask.duration, ask.proofProbability, ask.reward]
}

function erasureToArray(erasure) {
  return [erasure.totalChunks, erasure.totalNodes]
}

function porToArray(por) {
  return [por.u, por.publicKey, por.name]
}

function contentToArray(content) {
  return [content.cid, erasureToArray(content.erasure), porToArray(content.por)]
}

function requestToArray(request) {
  return [
    [
      request.client,
      askToArray(request.ask),
      contentToArray(request.content),
      request.expiry,
      request.nonce,
    ],
  ]
}

function slotId(slot) {
  const types = "tuple(bytes32, uint256)"
  const values = [slot.request, slot.index]
  const encoding = defaultAbiCoder.encode([types], [values])
  return keccak256(encoding)
}

module.exports = {
  requestId,
  slotId,
  requestToArray,
  askToArray,
}
