const { ethers } = require("hardhat")
const { keccak256, defaultAbiCoder } = ethers.utils

function requestId(request) {
  const Ask = "tuple(uint256, uint256, uint256, uint256)"
  const Erasure = "tuple(uint64, uint64, uint64)"
  const PoR = "tuple(bytes1[480], bytes1[96], bytes1[512])"
  const Content = "tuple(string, " + Erasure + ", " + PoR + ")"
  const Request =
    "tuple(address, " + Ask + ", " + Content + ", uint256, bytes32)"
  return keccak256(defaultAbiCoder.encode([Request], requestToArray(request)))
}

function offerId(offer) {
  return keccak256(
    defaultAbiCoder.encode(
      ["address", "bytes32", "uint256", "uint256"],
      offerToArray(offer)
    )
  )
}

function askToArray(ask) {
  return [ask.size, ask.duration, ask.proofProbability, ask.maxPrice]
}

function erasureToArray(erasure) {
  return [erasure.totalChunks, erasure.totalNodes, erasure.nodeId]
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

function offerToArray(offer) {
  return [offer.host, offer.requestId, offer.price, offer.expiry]
}

module.exports = {
  requestId,
  offerId,
  requestToArray,
  askToArray,
  offerToArray,
}
