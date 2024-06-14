// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Marketplace} from "../../contracts/Marketplace.sol";
import {MarketplaceConfig} from "../../contracts/Configuration.sol";
import {IGroth16Verifier} from "../../contracts/Groth16.sol";

contract MarketplaceHarness is Marketplace {
    constructor(MarketplaceConfig memory configuration, IERC20 token_, IGroth16Verifier verifier)
        Marketplace(configuration, token_, verifier)
    {}

    function totalReceived() public view returns (uint256) {
        return _marketplaceTotals.received;
    }

    function totalSent() public view returns (uint256) {
        return _marketplaceTotals.sent;
    }

    function tokenBalance() public view returns (uint256) {
        return token().balanceOf(address(this));
    }
}
