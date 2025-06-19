const { buildModule } = require('@nomicfoundation/hardhat-ignition/modules')
const { loadZkeyHash } = require("../../verifier/verifier.js")
const { loadConfiguration } = require("../../configuration/configuration.js")
const TokenModule = require("./token.js")
const VerifierModule = require("./verifier.js")

function getDefaultConfig() {
  const zkeyHash = loadZkeyHash(hre.network.name)
  const config = loadConfiguration(hre.network.name)
  config.proofs.zkeyHash = zkeyHash
  return config
}

/**
 * Module that deploy the Marketplace logic
 */
const marketplaceLogicModule = buildModule("MarketplaceLogic", (m) => {
  const marketplace = m.contract("Marketplace", [])

  let testMarketplace
  const config = hre.network.config

  if (config && config.tags && config.tags.includes("local")) {
    testMarketplace = m.contract("TestMarketplace", [])
  }

  return {
    marketplace,
    testMarketplace,
  }
})


/**
 * This module deploy Proxy with Marketplace contract used as implementation
 * and it initializes the Marketplace in the Proxy context.
 */
const proxyModule = buildModule('Proxy', (m) => {
  const deployer = m.getAccount(0)
  const config = hre.network.config


  // This address is the owner of the ProxyAdmin contract,
  // so it will be the only account that can upgrade the proxy when needed.
  let proxyAdminOwner

  if (config && config.tags && config.tags.includes("local")) {
    // The Proxy Admin is not allowed to make "forwarded" calls through Proxy,
    // it can only upgrade it, hence this account must not be used for example in tests.
    proxyAdminOwner = process.env.PROXY_ADMIN_ADDRESS || m.getAccount(9)
  } else {
    if (!process.env.PROXY_ADMIN_ADDRESS) {
      throw new Error("In non-Hardhat network you need to specify PROXY_ADMIN_ADDRESS env. variable")
    }

    proxyAdminOwner = process.env.PROXY_ADMIN_ADDRESS
  }

  const { marketplace } = m.useModule(marketplaceLogicModule)
  const { token } = m.useModule(TokenModule)
  const { verifier } = m.useModule(VerifierModule)
  const configuration = m.getParameter("configuration", getDefaultConfig())
  const encodedMarketplaceInitializerCall = m.encodeFunctionCall(
    marketplace,
    "initialize",
    [configuration, token, verifier]
  );

  // The TransparentUpgradeableProxy contract creates the ProxyAdmin within its constructor.
  const proxy = m.contract(
    'TransparentUpgradeableProxy',
    [
      marketplace,
      proxyAdminOwner,
      encodedMarketplaceInitializerCall,
    ],
    { from: deployer },
  )


  // We need to get the address of the ProxyAdmin contract that was created by the TransparentUpgradeableProxy
  // so that we can use it to upgrade the proxy later.
  const proxyAdminAddress = m.readEventArgument(
    proxy,
    'AdminChanged',
    'newAdmin'
  )

  // Here we use m.contractAt(...) to create a contract instance for the ProxyAdmin that we can interact with later to upgrade the proxy.
  const proxyAdmin = m.contractAt('ProxyAdmin', proxyAdminAddress)


  return { proxyAdmin, proxy, token }
})

/**
 * This module deploy Proxy with TestMarketplace contract used for testing purposes.
 */
const testProxyModule = buildModule('TestProxy', (m) => {
  const deployer = m.getAccount(0)
  const config = hre.network.config

  // We allow testing contract only in local/Hardhat network
  if (!(config && config.tags && config.tags.includes("local"))) {
    return { testProxy: undefined }
  }


  let proxyAdminOwner = process.env.PROXY_ADMIN_ADDRESS || m.getAccount(9)
  const { testMarketplace } = m.useModule(marketplaceLogicModule)
  const { token } = m.useModule(TokenModule)
  const { testVerifier } = m.useModule(VerifierModule)
  const configuration = m.getParameter("configuration", getDefaultConfig())
  const encodedMarketplaceInitializerCall = m.encodeFunctionCall(
    testMarketplace,
    "initialize",
    [configuration, token, testVerifier]
  );

  const testProxy = m.contract(
    'TransparentUpgradeableProxy',
    [
      testMarketplace,
      proxyAdminOwner,
      encodedMarketplaceInitializerCall,
    ],
    { from: deployer },
  )

  return { testProxy }
})

/**
 * The main module that represents Marketplace contract.
 * Underneath there is the deployed Proxy contract with Markeplace's logic used as proxy's implementation
 * and initilized proxy's context with Marketplace's configuration.
 */
module.exports = buildModule('Marketplace', (m) => {
  const { proxy, proxyAdmin, token } = m.useModule(proxyModule)
  const config = hre.network.config

  // We use the Proxy contract as it would be Marketplace contract
  const marketplace = m.contractAt('Marketplace', proxy)

  // We allow testing contract only in local/Hardhat network
  if (config && config.tags && config.tags.includes("local")) {
    const { testProxy } = m.useModule(testProxyModule)
    const testMarketplace = m.contractAt('TestMarketplace', testProxy)

    return { marketplace, proxy, proxyAdmin, testMarketplace, token }
  }

  // Return the contract instance, along with the original proxy and proxyAdmin contracts
  // so that they can be used by other modules, or in tests and scripts.
  return { marketplace, proxy, proxyAdmin, token }
})
