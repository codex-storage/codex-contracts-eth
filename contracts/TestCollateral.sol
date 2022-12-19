// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Collateral.sol";

// exposes internal functions for testing
contract TestCollateral is Collateral {
  // solhint-disable-next-line no-empty-blocks
  constructor(IERC20 token) Collateral(token) {}

  function slash(address account, uint256 percentage) public {
    _slash(account, percentage);
  }

  function isWithdrawAllowed() internal pure override returns (bool) {
    return true;
  }
}
