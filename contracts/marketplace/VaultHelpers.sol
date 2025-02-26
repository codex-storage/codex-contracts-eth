// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "../Requests.sol";
import "../Vault.sol";

import "hardhat/console.sol";

library VaultHelpers {
  enum VaultRole {
    client,
    host,
    validator
  }

  function clientAccount(
    Vault vault,
    address client
  ) internal pure returns (AccountId) {
    bytes12 discriminator = bytes12(bytes1(uint8(VaultRole.client)));
    return vault.encodeAccountId(client, discriminator);
  }

  function hostAccount(
    Vault vault,
    address host,
    uint64 slotIndex
  ) internal pure returns (AccountId) {
    bytes12 role = bytes12(bytes1(uint8(VaultRole.host)));
    bytes12 index = bytes12(uint96(slotIndex));
    bytes12 discriminator = role | index;
    return vault.encodeAccountId(host, discriminator);
  }

  function validatorAccount(
    Vault vault,
    address validator
  ) internal pure returns (AccountId) {
    bytes12 discriminator = bytes12(bytes1(uint8(VaultRole.validator)));
    return vault.encodeAccountId(validator, discriminator);
  }

  function asFundId(RequestId requestId) internal pure returns (FundId) {
    return FundId.wrap(RequestId.unwrap(requestId));
  }
}
