// first run `npm start` so deployment-localhost.json is written to disk
// might need to run with custom port to avoid conflict on e.g. port 8545:
// ./node_modules/.bin/hardhat node --port 34567 --export deployment-localhost.json
// then run this script:
// ./node_modules/.bin/hardhat run scripts/deploy.js --config hardhat.config_testnet.js --network [TESTNET_ID]
// make sure hardhat.config_testnet.js has matching TESTNET_ID and appropriate url and keys

const
  TESTNET_ID = "..." // e.g. "2337"

async function main() {
  const
    [deployer] = await ethers.getSigners()

  console.log("Deploying contracts with the account:", deployer.address)
  console.log("Account balance:", (await deployer.getBalance()).toString())

  const
    TestToken = await ethers.getContractFactory("TestToken")
    testToken = await TestToken.deploy()

  console.log("TestToken address:", testToken.address)

  const
    token = testToken.address
    proofPeriod = 10
    proofTimeout = 5
    proofDowntime = 64
    collateralAmount = 100
    slashMisses = 3
    slashPercentage = 10

  const
    Storage = await ethers.getContractFactory("Storage")
    storage = await Storage.deploy(token, proofPeriod, proofTimeout,
      proofDowntime, collateralAmount, slashMisses, slashPercentage)

  console.log("Storage address:", storage.address)

  const
    file = "./deployment-localhost.json"
    fs = require("fs/promises")

  let
    deployment = JSON.parse((await fs.readFile(file)).toString())

  deployment.name = "testnet"
  deployment.chainId = TESTNET_ID
  deployment.contracts.TestToken.address = testToken.address
  deployment.contracts.Storage.address = storage.address

  await fs.writeFile(file, JSON.stringify(deployment, null, 2))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
