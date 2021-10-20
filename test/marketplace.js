const { ethers } = require("hardhat")

function hashRequest(duration, size, hash, proofPeriod, proofTimeout, nonce) {
  const type = "[dagger.request.v1]"
  return ethers.utils.solidityKeccak256(
    ["string", "uint", "uint", "bytes32", "uint", "uint", "bytes32"],
    [type, duration, size, hash, proofPeriod, proofTimeout, nonce]
  )
}

function hashBid(requestHash, expiry, price) {
  const type = "[dagger.bid.v1]"
  return ethers.utils.solidityKeccak256(
    ["string", "bytes32", "uint", "uint"],
    [type, requestHash, expiry, price]
  )
}

async function sign(signer, hash) {
  return await signer.signMessage(ethers.utils.arrayify(hash))
}

module.exports = { hashRequest, hashBid, sign }
