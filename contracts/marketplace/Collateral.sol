// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "../Configuration.sol";
import "../Requests.sol";

library Collateral {
  using Collateral for Request;
  using Collateral for CollateralConfig;

  function checkCorrectness(
    CollateralConfig memory configuration
  ) internal pure {
    require(
      configuration.repairRewardPercentage <= 100,
      Marketplace_RepairRewardPercentageTooHigh()
    );
    require(
      configuration.slashPercentage <= 100,
      Marketplace_SlashPercentageTooHigh()
    );
    require(
      configuration.maxNumberOfSlashes * configuration.slashPercentage <= 100,
      Marketplace_MaximumSlashingTooHigh()
    );
  }

  function slashAmount(
    CollateralConfig storage configuration,
    uint128 collateral
  ) internal view returns (uint128) {
    return (collateral * configuration.slashPercentage) / 100;
  }

  function repairReward(
    CollateralConfig storage configuration,
    uint128 collateral
  ) internal view returns (uint128) {
    return (collateral * configuration.repairRewardPercentage) / 100;
  }

  function validatorReward(
    CollateralConfig storage configuration,
    uint128 slashed
  ) internal view returns (uint128) {
    return (slashed * configuration.validatorRewardPercentage) / 100;
  }

  function designatedCollateral(
    CollateralConfig storage configuration,
    uint128 collateral
  ) internal view returns (uint128) {
    uint8 slashes = configuration.maxNumberOfSlashes;
    uint128 slashing = configuration.slashAmount(collateral);
    uint128 validation = slashes * configuration.validatorReward(slashing);
    uint128 repair = configuration.repairReward(collateral);
    return collateral - validation - repair;
  }

  error Marketplace_RepairRewardPercentageTooHigh();
  error Marketplace_SlashPercentageTooHigh();
  error Marketplace_MaximumSlashingTooHigh();
}
