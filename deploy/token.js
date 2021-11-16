module.exports = async ({deployments, getNamedAccounts}) => {
  const { deployer } = await getNamedAccounts()
  await deployments.deploy('TestToken', { args: [[deployer]], from: deployer })
}

module.exports.tags = ['TestToken']
