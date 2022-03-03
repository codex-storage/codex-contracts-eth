const { ethers } = require("hardhat")
const { keccak256, defaultAbiCoder } = ethers.utils

function requestId(request) {
  return keccak256(
    defaultAbiCoder.encode(
      [
        "address",
        "uint256",
        "uint256",
        "bytes32",
        "uint256",
        "uint256",
        "uint256",
        "bytes32",
      ],
      requestToArray(request)
    )
  )
}

function offerId(offer) {
  return keccak256(
    defaultAbiCoder.encode(
      ["address", "bytes32", "uint256", "uint256"],
      offerToArray(offer)
    )
  )
}

function requestToArray(request) {
  return [
    request.client,
    request.duration,
    request.size,
    request.contentHash,
    request.proofProbability,
    request.maxPrice,
    request.expiry,
    request.nonce,
  ]
}

function offerToArray(offer) {
  return [offer.host, offer.requestId, offer.price, offer.expiry]
}

module.exports = { requestId, offerId, requestToArray, offerToArray }
