// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

struct MarketplaceConfig {
  CollateralConfig collateral;
  ProofConfig proofs;
}

struct CollateralConfig {
  uint256 minimumAmount; // frees slot when collateral drops below this minimum
  uint256 slashCriterion; // amount of proofs missed that lead to slashing
  uint256 slashPercentage; // percentage of the collateral that is slashed
}

struct ProofConfig {
  uint256 period; // proofs requirements are calculated per period (in seconds)
  uint256 timeout; // mark proofs as missing before the timeout (in seconds)
  uint8 downtime; // ignore this much recent blocks for proof requirements
}
