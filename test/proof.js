const fs = require("fs")
const ethers = require("ethers")
const { BigNumber } = ethers

const BASE_PATH = __dirname + "/../verifier/networks"
const PROOF_FILE_NAME = "example-proof/proof.json"
const PUBLIC_INPUT_FILE_NAME = "example-proof/public.json"
const VERIFICATION_KEY_FILE_NAME =
  "verification-key/proof_main_verification_key.json"

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

function loadVerificationKey(name) {
  const key = JSON.parse(
    fs.readFileSync(`${BASE_PATH}/${name}/${VERIFICATION_KEY_FILE_NAME}`)
  )
  return {
    alpha1: G1ToStruct(key["vk_alpha_1"]),
    beta2: G2ToStruct(key["vk_beta_2"]),
    gamma2: G2ToStruct(key["vk_gamma_2"]),
    delta2: G2ToStruct(key["vk_delta_2"]),
    IC: key["IC"].map(G1ToStruct),
  }
}

module.exports = { loadProof, loadPublicInput, loadVerificationKey }
