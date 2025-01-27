// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

struct MarketplaceConfig {
  CollateralConfig collateral;
  ProofConfig proofs;
  SlotReservationsConfig reservations;
}

struct CollateralConfig {
  /// @dev percentage of collateral that is used as repair reward
  uint8 repairRewardPercentage;
  uint8 maxNumberOfSlashes; // frees slot when the number of slashing reaches this value
  uint8 slashPercentage; // percentage of the collateral that is slashed
  uint8 validatorRewardPercentage; // percentage of the slashed amount going to the validators
}

struct ProofConfig {
  uint256 period; // proofs requirements are calculated per period (in seconds)
  uint256 timeout; // mark proofs as missing before the timeout (in seconds)
  uint8 downtime; // ignore this much recent blocks for proof requirements
  string zkeyHash; // hash of the zkey file which is linked to the verifier
  // Ensures the pointer does not remain in downtime for many consecutive
  // periods. For each period increase, move the pointer `pointerProduct`
  // blocks. Should be a prime number to ensure there are no cycles.
  uint8 downtimeProduct;
}

struct SlotReservationsConfig {
  // Number of allowed reservations per slot
  uint8 maxReservations;
}
