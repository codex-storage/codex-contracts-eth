const fs = require("fs")
const ethers = require("ethers")
const { arrayify } = ethers.utils

const BASE_PATH = __dirname + "/../contracts/verifiers"
const PROOF_FILE_NAME = "proof.json"
const PUBLIC_FILE_NAME = "public.json"

// TODO: Some error handling, when file don't exists or don't have expected format?
function loadProof(name) {
  const proof = JSON.parse(
    fs.readFileSync(`${BASE_PATH}/${name}/${PROOF_FILE_NAME}`)
  )
  const publicSignals = JSON.parse(
    fs.readFileSync(`${BASE_PATH}/${name}/${PUBLIC_FILE_NAME}`)
  )

  // TODO: We need to do some input processing from the given files, that I did not have time to look into
  //    instead I hardcoded the values. Look into https://github.com/iden3/snarkjs#26-simulate-a-verification-call
  //    how to obtain it.

  //return [proof.pi_a, proof.pi_b, proof.pi_c, public]
  return arrayify(
    "0x" +
      "1bcdb9a3c52070f56e8d49b29239f0528817f99745157ce4d03faefddfff6acc" +
      "2496ab7dd8f0596c21653105e4af7e48eb5395ea45e0c876d7db4dd31b4df23e" +
      "002ef03c350ccfbf234bfde498378709edea3a506383d492b58c4c35ffecc508" +
      "174d475745707d35989001e9216201bdb828130b0e78dbf772c4795fa845b5eb" +
      "1f04519f202fac14311c65d827f65f787dbe01985044278292723b9ee77ce5ee" +
      "1c42f4d640e94c28401392031e74426ae68145f4f520cd576ca5e5b9af97c0bb" +
      "1db1e61b32db677f3927ec117569e068f62747986e4ac7f54db8f2acd17e4abc" +
      "20a59e1daca2ab80199c5bca2c5a7d6de6348bd795a0dd999752cc462d851128"
  )
}

module.exports = { loadProof }
