import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname =  dirname(fileURLToPath(import.meta.url))

const contractFile = 'verifier_groth.sol'
const verificationKeyFile = 'proof_main_verification_key.json'
const templatePath = join(__dirname, 'template', contractFile)
const networksPath = join(__dirname, 'networks')

const template = await readFile(templatePath, { encoding: 'utf-8' })

function G1ToSolidity(point) {
  return point[0] + ', ' + point[1]
}

function G2ToSolidity(point) {
  return '[' + point[0][1] + ',' + point[0][0] + ']' +
         ', ' +
         '[' + point[1][1] + ',' + point[1][0] + ']'
}

for (const network of await readdir(networksPath)) {
  const networkPath = join(networksPath, network)
  const verificationKeyPath = join(networkPath, 'verification-key', verificationKeyFile)
  const verificationKey = JSON.parse(await readFile(verificationKeyPath))

  const alpha1 = G1ToSolidity(verificationKey['vk_alpha_1'])
  const beta2 = G2ToSolidity(verificationKey['vk_beta_2'])
  const gamma2 = G2ToSolidity(verificationKey['vk_gamma_2'])
  const delta2 = G2ToSolidity(verificationKey['vk_delta_2'])
  const icLength = verificationKey['IC'].length
  let icParts = ''
  for (let index = 0; index < icLength; index++) {
    if (index > 0) {
      icParts = icParts + '\n    '
    }
    let ic = verificationKey['IC'][index]
    icParts = icParts + 'verifyingKey.IC.push(Pairing.G1Point(' + G1ToSolidity(ic) + '));'
  }
  const inputLength = verificationKey['nPublic']

  const contract = template
      .replaceAll('<%vk_alpha1%>', alpha1)
      .replaceAll('<%vk_beta2%>', beta2)
      .replaceAll('<%vk_gamma2%>', gamma2)
      .replaceAll('<%vk_delta2%>', delta2)
      .replaceAll('<%vk_ic_length%>', icLength)
      .replaceAll('<%vk_ic_pts%>', icParts)
      .replaceAll('<%vk_input_length%>', inputLength)

  const preprocessedPath = join(__dirname, '..', 'contracts', 'verifiers', network)
  await mkdir(preprocessedPath, { recursive: true })
  const contractPath = join(preprocessedPath, contractFile)
  await writeFile(contractPath, contract)
}
