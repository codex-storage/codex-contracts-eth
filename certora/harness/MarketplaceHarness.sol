// SPDX-License-Identifier: MIT

pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IGroth16Verifier} from "../../contracts/Groth16.sol";
import {MarketplaceConfig} from "../../contracts/Configuration.sol";
import {Marketplace} from "../../contracts/Marketplace.sol";
import {Requests, Request, AskHelpers, Ask, RequestState, SlotState, RequestId, SlotId} from "../../contracts/Requests.sol";

contract MarketplaceHarness is Marketplace {
  using Requests for Request;
  using AskHelpers for Ask;

  constructor(
    MarketplaceConfig memory config,
    IERC20 token,
    IGroth16Verifier verifier
  ) Marketplace(config, token, verifier) {}

  function publicPeriodEnd(Period period) public view returns (uint64) {
    return _periodEnd(period);
  }

  function slots(SlotId slotId) public view returns (Slot memory) {
    return _slots[slotId];
  }

  function generateSlotId(
    RequestId requestId,
    uint64 slotIndex
  ) public pure returns (SlotId) {
    return Requests.slotId(requestId, slotIndex);
  }

  /******************/
  /* FUNDS TRACKING */
  /******************/

  // TODO: Once reward for submitting missing proof call is implemented, add it here
  // https://github.com/codex-storage/codex-contracts-eth/issues/70

  function pricePerSlot(Request memory request) private pure returns (uint256) {
    return request.ask.duration * request.ask.pricePerSlotPerSecond();
  }

  /**
   * View that returns allocated funds to the host for given request and its slot
   * based on the state of the request/slot.
   */
  function requestSlotFunds(
    RequestId requestId,
    uint64 slotIndex
  ) public view returns (uint256) {
    SlotId slotId = Requests.slotId(requestId, slotIndex);
    Slot memory slot = _slots[slotId];
    SlotState state = slotState(slotId);
    Request memory request = _requests[requestId];

    // Payout to hosts is allocated only upon successfully finishing of the Request
    // or partial payout when Request expires
    if (
      state == SlotState.Free ||
      state == SlotState.Failed ||
      state == SlotState.Paid
    ) {
      return 0;
    } else if (state == SlotState.Free) {
      return pricePerSlot(request);
    } else if (state == SlotState.Repair) {
      uint256 collateralPerSlot = request.ask.collateralPerSlot();
      // Discount that the next host that will repair and fill the slot will get for its collateral
      return
        (collateralPerSlot * _config.collateral.repairRewardPercentage) / 100;
    } else if (state == SlotState.Filled || state == SlotState.Finished) {
      return _slotPayout(requestId, slot.filledAt) + slot.currentCollateral;
    } else if (state == SlotState.Cancelled) {
      return
        _slotPayout(requestId, slot.filledAt, requestExpiry(requestId)) +
        slot.currentCollateral;
    }

    revert("Invalid state");
  }

  /**
   * View that returns request funds.
   * These funds are allocated to the client.
   */
  function requestFunds(RequestId requestId) public view returns (uint256) {
    Request memory request = _requests[requestId];
    RequestState state = requestState(requestId);

    if (state == RequestState.New || state == RequestState.Failed) {
      return request.maxPrice();
    } else if (
      state == RequestState.Finished ||
      state == RequestState.Started ||
      state == RequestState.Cancelled
    ) {
      return _requestContexts[requestId].fundsToReturnToClient;
    }

    revert("Invalid state");
  }
}
