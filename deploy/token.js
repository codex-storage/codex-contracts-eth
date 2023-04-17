const MINTED_TOKENS = 1_000_000_000

module.exports = async ({ deployments, getNamedAccounts, getUnnamedAccounts }) => {
  const { deployer } = await getNamedAccounts()
  const tokenDeployment = await deployments.deploy("TestToken", { from: deployer })
  const token = await hre.ethers.getContractAt("TestToken", tokenDeployment.address)

  const accounts = [...Object.values(await getNamedAccounts()), ...(await getUnnamedAccounts())]
  for (const account of accounts) {
    console.log(`Minting ${MINTED_TOKENS} tokens to address ${account}`)

    const transaction = await token.mint(account, MINTED_TOKENS, { from: deployer })
    await transaction.wait()
  }
}

module.exports.tags = ["TestToken"]
