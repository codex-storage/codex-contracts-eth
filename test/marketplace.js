const { ethers } = require("hardhat")

function hashRequest(duration, size, hash, proofPeriod, proofTimeout) {
  return ethers.utils.solidityKeccak256(
    ["string", "uint", "uint", "bytes32", "uint", "uint"],
    ["[dagger.request.v1]", duration, size, hash, proofPeriod, proofTimeout]
  )
}

function hashBid(requestHash, expiry, price) {
  return ethers.utils.solidityKeccak256(
    ["string", "bytes32", "uint", "uint"],
    ["[dagger.bid.v1]", requestHash, expiry, price]
  )
}

async function sign(signer, hash) {
  return await signer.signMessage(ethers.utils.arrayify(hash))
}

module.exports = { hashRequest, hashBid, sign }
