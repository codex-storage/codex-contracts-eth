const fs = require("fs")
const ethers = require("ethers")
const { BigNumber } = ethers

const BASE_PATH = __dirname + "/../verifier/networks"
const PROOF_FILE_NAME = "example-proof/proof.json"

function G1ToUInts(point) {
  return [
    point[0],
    point[1]
  ]
}

function G2ToUInts(point) {
  return [
    point[0][1],
    point[0][0],
    point[1][1],
    point[1][0]
  ]
}

function loadProof(name) {
  const proof = JSON.parse(
    fs.readFileSync(`${BASE_PATH}/${name}/${PROOF_FILE_NAME}`)
  )
  return []
    .concat(G1ToUInts(proof['pi_a']))
    .concat(G2ToUInts(proof['pi_b']))
    .concat(G1ToUInts(proof['pi_c']))
}

module.exports = { loadProof }
