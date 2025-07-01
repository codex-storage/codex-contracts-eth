const { buildModule } = require('@nomicfoundation/hardhat-ignition/modules')
const MarketplaceModule = require("./marketplace.js")

/**
 * This module upgrades the Marketplace's Proxy with a new implementation.
 * It deploys the new Marketplace contract and then calls the Proxy with
 * the `upgradeAndCall` function, which swaps the implementations.
 */
const upgradeModule = buildModule('UpgradeProxyImplementation', (m) => {
  const config = hre.network.config

  if (!(config && config.tags && config.tags.includes("local"))) {
    throw new Error("Module is not meant for real deployments!")
  }

  const proxyAdminOwner = m.getAccount(9)
  const marketplaceUpgraded = m.contract("TestMarketplaceUpgraded", [])
  const {proxyAdmin, proxy, token} = m.useModule(MarketplaceModule);

  m.call(proxyAdmin, "upgradeAndCall", [proxy, marketplaceUpgraded, "0x"], {
    from: proxyAdminOwner,
  });

  return { proxyAdmin, proxy, token };
})

/**
 * The main module that represents the upgraded Marketplace contract.
 */
module.exports = buildModule('MarketplaceUpgraded', (m) => {
  const { proxy, proxyAdmin, token } = m.useModule(upgradeModule)

  const marketplace = m.contractAt('TestMarketplaceUpgraded', proxy)

  return { marketplace, proxy, proxyAdmin, token }
})
