// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Marketplace.sol";
import "./Proofs.sol";
import "./Collateral.sol";

contract Storage is Marketplace {
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
    Marketplace(
      token,
      _collateralAmount,
      _minCollateralThreshold,
      _slashMisses,
      _slashPercentage,
      _proofPeriod,
      _proofTimeout,
      _proofDowntime
    )
  {}
}
