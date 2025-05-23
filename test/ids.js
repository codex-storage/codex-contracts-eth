const { keccak256, AbiCoder } = require("hardhat").ethers

function requestId(request) {
  const Ask = "tuple(uint256, uint256, uint256, uint64, uint64, uint64, int64)"
  const Content = "tuple(bytes, bytes32)"
  const Request =
    "tuple(address, " + Ask + ", " + Content + ", uint64, bytes32)"
  return keccak256(new AbiCoder().encode([Request], requestToArray(request)))
}

function askToArray(ask) {
  return [
    ask.proofProbability,
    ask.pricePerBytePerSecond,
    ask.collateralPerByte,
    ask.slots,
    ask.slotSize,
    ask.duration,
    ask.maxSlotLoss,
  ]
}

function contentToArray(content) {
  return [content.cid, content.merkleRoot]
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
  const encoding = new AbiCoder().encode([types], [values])
  return keccak256(encoding)
}

module.exports = {
  requestId,
  slotId,
  requestToArray,
  askToArray,
}
