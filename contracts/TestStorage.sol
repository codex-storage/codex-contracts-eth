// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Storage.sol";

// exposes internal functions of Storage for testing
contract TestStorage is Storage {
  constructor(
    IERC20 token,
    uint256 _proofPeriod,
    uint256 _proofTimeout,
    uint8 _proofDowntime,
    uint256 _collateralAmount,
    uint256 _slashMisses,
    uint256 _slashPercentage,
    uint256 _minCollateralThreshold
  )
    Storage(
      token,
      _proofPeriod,
      _proofTimeout,
      _proofDowntime,
      _collateralAmount,
      _slashMisses,
      _slashPercentage,
      _minCollateralThreshold
    )
  // solhint-disable-next-line no-empty-blocks
  {

  }

  function slashAmount(address account, uint256 percentage) public view returns (uint256) {
    return _slashAmount(account, percentage);
  }
}
