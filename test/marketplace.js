const { ethers } = require("hardhat")

function hashRequest({
  duration,
  size,
  contentHash,
  proofPeriod,
  proofTimeout,
  nonce,
}) {
  const type = "[dagger.request.v1]"
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["string", "uint", "uint", "bytes32", "uint", "uint", "bytes32"],
      [type, duration, size, contentHash, proofPeriod, proofTimeout, nonce]
    )
  )
}

function hashBid({ requestHash, bidExpiry, price }) {
  const type = "[dagger.bid.v1]"
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["string", "bytes32", "uint", "uint"],
      [type, requestHash, bidExpiry, price]
    )
  )
}

async function sign(signer, hash) {
  return await signer.signMessage(ethers.utils.arrayify(hash))
}

module.exports = { hashRequest, hashBid, sign }
