require("@nomiclabs/hardhat-waffle")
require("hardhat-deploy")
require("hardhat-deploy-ethers")

module.exports = {
  solidity: "0.8.4",
  namedAccounts: {
    deployer: { default: 0 }
  }
}
