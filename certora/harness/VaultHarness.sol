// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "../../contracts/Vault.sol";

contract VaultHarness is Vault {
  constructor(IERC20 token) Vault(token) {}

    function publicStatus(
        Controller controller,
        FundId fundId
    ) public view returns (FundStatus) {
        return _getFundStatus(controller, fundId);
    }

}
