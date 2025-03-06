// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Vault} from "../../contracts/Vault.sol";
import {IGroth16Verifier} from "../../contracts/Groth16.sol";
import {MarketplaceConfig} from "../../contracts/Configuration.sol";
import {Marketplace} from "../../contracts/Marketplace.sol";
import {RequestId, SlotId} from "../../contracts/Requests.sol";
import {Requests} from "../../contracts/Requests.sol";
import {Timestamp} from "../../contracts/Timestamps.sol";

contract MarketplaceHarness is Marketplace {
    constructor(MarketplaceConfig memory config, Vault vault, IGroth16Verifier verifier)
        Marketplace(config, vault, verifier)
    {}

    function publicPeriodEnd(Period period) public view returns (Timestamp) {
        return _periodEnd(period);
    }

    function slots(SlotId slotId) public view returns (Slot memory) {
        return _slots[slotId];
    }

    function generateSlotId(RequestId requestId, uint64 slotIndex) public pure returns (SlotId) {
        return Requests.slotId(requestId, slotIndex);
    }
}
