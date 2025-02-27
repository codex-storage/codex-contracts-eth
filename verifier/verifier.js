const fs = require("fs")

const BASE_PATH = __dirname + "/networks"
const PROOF_FILE_NAME = "example-proof/proof.json"
const PUBLIC_INPUT_FILE_NAME = "example-proof/public.json"
const ZKEY_HASH_FILE_NAME = "zkey_hash.json"
const VERIFICATION_KEY_FILE_NAME =
  "proof_main_verification_key.json"

function G1ToStruct(point) {
  return {
    x: point[0],
    y: point[1],
  }
}

function G2ToStruct(point) {
  return {
    x: { real: point[0][0], imag: point[0][1] },
    y: { real: point[1][0], imag: point[1][1] },
  }
}

function loadProof(name) {
  const path = `${BASE_PATH}/${name}/${PROOF_FILE_NAME}`
  const proof = JSON.parse(fs.readFileSync(path))
  return {
    a: G1ToStruct(proof["pi_a"]),
    b: G2ToStruct(proof["pi_b"]),
    c: G1ToStruct(proof["pi_c"]),
  }
}

function loadPublicInput(name) {
  const path = `${BASE_PATH}/${name}/${PUBLIC_INPUT_FILE_NAME}`
  const input = JSON.parse(fs.readFileSync(path))
  return input
}

function loadZkeyHash(name) {
  const path = `${BASE_PATH}/${name}/${ZKEY_HASH_FILE_NAME}`
  const input = JSON.parse(fs.readFileSync(path))
  return input
}

function loadVerificationKey(name) {
  const path = `${BASE_PATH}/${name}/${VERIFICATION_KEY_FILE_NAME}`
  const key = JSON.parse(fs.readFileSync(path))
  return {
    alpha1: G1ToStruct(key["vk_alpha_1"]),
    beta2: G2ToStruct(key["vk_beta_2"]),
    gamma2: G2ToStruct(key["vk_gamma_2"]),
    delta2: G2ToStruct(key["vk_delta_2"]),
    ic: key["IC"].map(G1ToStruct),
  }
}

module.exports = { loadProof, loadPublicInput, loadVerificationKey, loadZkeyHash }
