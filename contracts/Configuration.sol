// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

struct MarketplaceConfig {
  CollateralConfig collateral;
  ProofConfig proofs;
}

struct CollateralConfig {
  /// @dev percentage of remaining collateral slot after it has been freed
  /// (equivalent to `collateral - (collateral*maxNumberOfSlashes*slashPercentage)/100`)
  /// TODO: to be aligned more closely with actual cost of repair once bandwidth incentives are known,
  /// see https://github.com/codex-storage/codex-contracts-eth/pull/47#issuecomment-1465511949.
  uint8 repairRewardPercentage;
  uint8 maxNumberOfSlashes; // frees slot when the number of slashing reaches this value
  uint16 slashCriterion; // amount of proofs missed that lead to slashing
  uint8 slashPercentage; // percentage of the collateral that is slashed
}

struct ProofConfig {
  uint256 period; // proofs requirements are calculated per period (in seconds)
  uint256 timeout; // mark proofs as missing before the timeout (in seconds)
  uint8 downtime; // ignore this much recent blocks for proof requirements
}
