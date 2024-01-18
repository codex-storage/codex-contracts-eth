const fs = require("fs")
const ethers = require("ethers")
const { arrayify, concat } = ethers.utils
const { BigNumber } = ethers

const BASE_PATH = __dirname + "/../verifier/networks"
const PROOF_FILE_NAME = "example-proof/proof.json"

function decimalToBytes(decimal) {
  return arrayify(BigNumber.from(decimal).toHexString())
}

function G1ToBytes(point) {
  return concat([
    decimalToBytes(point[0]),
    decimalToBytes(point[1])
  ])
}

function G2ToBytes(point) {
  return concat([
    decimalToBytes(point[0][1]),
    decimalToBytes(point[0][0]),
    decimalToBytes(point[1][1]),
    decimalToBytes(point[1][0])
  ])
}

function loadProof(name) {
  const proof = JSON.parse(
    fs.readFileSync(`${BASE_PATH}/${name}/${PROOF_FILE_NAME}`)
  )
  return concat([
    G1ToBytes(proof['pi_a']),
    G2ToBytes(proof['pi_b']),
    G1ToBytes(proof['pi_c'])
  ])
}

module.exports = { loadProof }
