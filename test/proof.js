const fs = require("fs")
const ethers = require("ethers")
const { BigNumber } = ethers

const BASE_PATH = __dirname + "/../verifier/networks"
const PROOF_FILE_NAME = "example-proof/proof.json"
const PUBLIC_INPUT_FILE_NAME = "example-proof/public.json"

function G1ToStruct(point) {
  return {
    x: point[0],
    y: point[1],
  }
}

function G2ToStruct(point) {
  return {
    x: [point[0][1], point[0][0]],
    y: [point[1][1], point[1][0]],
  }
}

function loadProof(name) {
  const proof = JSON.parse(
    fs.readFileSync(`${BASE_PATH}/${name}/${PROOF_FILE_NAME}`)
  )
  return {
    a: G1ToStruct(proof["pi_a"]),
    b: G2ToStruct(proof["pi_b"]),
    c: G1ToStruct(proof["pi_c"]),
  }
}

function loadPublicInput(name) {
  const input = JSON.parse(
    fs.readFileSync(`${BASE_PATH}/${name}/${PUBLIC_INPUT_FILE_NAME}`)
  )
  return input
}

module.exports = { loadProof, loadPublicInput }
