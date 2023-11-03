// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./Configuration.sol";
import "./Requests.sol";
import "./Proofs.sol";
import "./StateRetrieval.sol";

contract Marketplace is Proofs, StateRetrieval {
  using SafeERC20 for IERC20;

  error Marketplace_RepairRewardPercentageTooHigh();
  error Marketplace_SlashPercentageTooHigh();
  error Marketplace_MaximumSlashingTooHigh();
  error Marketplace_InvalidClientAddress();
  error Marketplace_RequestAlreadyExists();
  error Marketplace_InvalidSlot();
  error Marketplace_SlotNotFree();
  error Marketplace_InvalidSlotHost();
  error Marketplace_AlreadyPaid();
  error Marketplace_TransferFailed();
  error Marketplace_UnknownRequest();
  error Marketplace_RequestNotYetTimedOut();
  error Marketplace_InvalidState();
  error Marketplace_StartNotBeforeExpiry();
  error Marketplace_SlotNotAcceptingProofs();
  error Marketplace_SlotIsFree();

  using EnumerableSet for EnumerableSet.Bytes32Set;
  using Requests for Request;

  IERC20 public immutable token;
  MarketplaceConfig public config;

  mapping(RequestId => Request) private _requests;
  mapping(RequestId => RequestContext) private _requestContexts;
  mapping(SlotId => Slot) internal _slots;

  MarketplaceTotals internal _marketplaceTotals;

  struct RequestContext {
    RequestState state;
    uint256 slotsFilled;
    /// @notice Tracks how much funds should be returned when Request expires to the Request creator
    /// @dev The sum is deducted every time a host fills a Slot by precalculated amount that he should receive if the Request expires
    uint256 expiryFundsWithdraw;
    uint256 startedAt;
    uint256 endsAt;
  }

  struct Slot {
    SlotState state;
    RequestId requestId;
    /// @notice Timestamp that signals when slot was filled
    /// @dev Used for partial payouts when Requests expires and Hosts are paid out only the time they host the content.
    uint256 filledAt;
    uint256 slotIndex;
    /// @notice Tracks the current amount of host's collateral that is to be payed out at the end of Slot's lifespan.
    /// @dev When Slot is filled, the collateral is collected in amount of request.ask.collateral
    /// @dev When Host is slashed for missing a proof the slashed amount is reflected in this variable
    uint256 currentCollateral;
    address host;
  }

  struct ActiveSlot {
    Request request;
    uint256 slotIndex;
  }

  constructor(
    IERC20 token_,
    MarketplaceConfig memory configuration
  ) Proofs(configuration.proofs) {
    token = token_;

    if (configuration.collateral.repairRewardPercentage > 100) {
      revert Marketplace_RepairRewardPercentageTooHigh();
    }

    if (configuration.collateral.slashPercentage > 100) {
      revert Marketplace_SlashPercentageTooHigh();
    }

    if (
      configuration.collateral.maxNumberOfSlashes *
        configuration.collateral.slashPercentage >
      100
    ) {
      revert Marketplace_MaximumSlashingTooHigh();
    }
    config = configuration;
  }

  function requestStorage(Request calldata request) public {
    if (request.client != msg.sender) {
      revert Marketplace_InvalidClientAddress();
    }

    RequestId id = request.id();
    if (_requests[id].client != address(0)) {
      revert Marketplace_RequestAlreadyExists();
    }

    _requests[id] = request;
    _requestContexts[id].endsAt = block.timestamp + request.ask.duration;

    _addToMyRequests(request.client, id);

    uint256 amount = request.price();
    _requestContexts[id].expiryFundsWithdraw = amount;
    _marketplaceTotals.received += amount;
    _transferFrom(msg.sender, amount);

    emit StorageRequested(id, request.ask, request.expiry);
  }

  function fillSlot(
    RequestId requestId,
    uint256 slotIndex,
    bytes calldata proof
  ) public requestIsKnown(requestId) {
    Request storage request = _requests[requestId];
    if (slotIndex >= request.ask.slots) {
      revert Marketplace_InvalidSlot();
    }

    SlotId slotId = Requests.slotId(requestId, slotIndex);
    Slot storage slot = _slots[slotId];
    slot.requestId = requestId;
    slot.slotIndex = slotIndex;

    if (slotState(slotId) != SlotState.Free) {
      revert Marketplace_SlotNotFree();
    }

    _startRequiringProofs(slotId, request.ask.proofProbability);
    submitProof(slotId, proof);

    slot.host = msg.sender;
    slot.state = SlotState.Filled;
    slot.filledAt = block.timestamp;
    RequestContext storage context = _requestContexts[requestId];
    context.slotsFilled += 1;
    context.expiryFundsWithdraw -= _expiryPayoutAmount(
      requestId,
      block.timestamp
    );

    // Collect collateral
    uint256 collateralAmount = request.ask.collateral;
    _transferFrom(msg.sender, collateralAmount);
    _marketplaceTotals.received += collateralAmount;
    slot.currentCollateral = collateralAmount;

    _addToMySlots(slot.host, slotId);

    emit SlotFilled(requestId, slotIndex);
    if (context.slotsFilled == request.ask.slots) {
      context.state = RequestState.Started;
      context.startedAt = block.timestamp;
      emit RequestFulfilled(requestId);
    }
  }

  function freeSlot(SlotId slotId) public slotIsNotFree(slotId) {
    Slot storage slot = _slots[slotId];
    if (slot.host != msg.sender) {
      revert Marketplace_InvalidSlotHost();
    }

    SlotState state = slotState(slotId);
    if (state == SlotState.Paid) {
      revert Marketplace_AlreadyPaid();
    }

    if (state == SlotState.Finished) {
      _payoutSlot(slot.requestId, slotId);
    } else if (state == SlotState.Cancelled) {
      _payoutCancelledSlot(slot.requestId, slotId);
    } else if (state == SlotState.Failed) {
      _removeFromMySlots(msg.sender, slotId);
    } else if (state == SlotState.Filled) {
      _forciblyFreeSlot(slotId);
    }
  }

  function markProofAsMissing(SlotId slotId, Period period) public {
    if (slotState(slotId) != SlotState.Filled) {
      revert Marketplace_SlotNotAcceptingProofs();
    }

    _markProofAsMissing(slotId, period);
    Slot storage slot = _slots[slotId];
    Request storage request = _requests[slot.requestId];

    if (missingProofs(slotId) % config.collateral.slashCriterion == 0) {
      uint256 slashedAmount = (request.ask.collateral *
        config.collateral.slashPercentage) / 100;
      slot.currentCollateral -= slashedAmount;
      if (
        missingProofs(slotId) / config.collateral.slashCriterion >=
        config.collateral.maxNumberOfSlashes
      ) {
        // When the number of slashings is at or above the allowed amount,
        // free the slot.
        _forciblyFreeSlot(slotId);
      }
    }
  }

  function _forciblyFreeSlot(SlotId slotId) internal {
    Slot storage slot = _slots[slotId];
    RequestId requestId = slot.requestId;
    RequestContext storage context = _requestContexts[requestId];

    _removeFromMySlots(slot.host, slotId);

    uint256 slotIndex = slot.slotIndex;
    delete _slots[slotId];
    context.slotsFilled -= 1;
    emit SlotFreed(requestId, slotIndex);
    _resetMissingProofs(slotId);

    Request storage request = _requests[requestId];
    uint256 slotsLost = request.ask.slots - context.slotsFilled;
    if (
      slotsLost > request.ask.maxSlotLoss &&
      context.state == RequestState.Started
    ) {
      context.state = RequestState.Failed;
      context.endsAt = block.timestamp - 1;
      emit RequestFailed(requestId);

      // TODO: send client remaining funds
    }
  }

  function _payoutSlot(
    RequestId requestId,
    SlotId slotId
  ) private requestIsKnown(requestId) {
    RequestContext storage context = _requestContexts[requestId];
    Request storage request = _requests[requestId];
    context.state = RequestState.Finished;
    _removeFromMyRequests(request.client, requestId);
    Slot storage slot = _slots[slotId];

    _removeFromMySlots(slot.host, slotId);

    uint256 amount = _requests[requestId].pricePerSlot() +
      slot.currentCollateral;
    _marketplaceTotals.sent += amount;
    slot.state = SlotState.Paid;
    assert(token.transfer(slot.host, amount));
  }

  function _payoutCancelledSlot(
    RequestId requestId,
    SlotId slotId
  ) private requestIsKnown(requestId) {
    Slot storage slot = _slots[slotId];
    _removeFromMySlots(slot.host, slotId);

    uint256 amount = _expiryPayoutAmount(requestId, slot.filledAt) +
      slot.currentCollateral;
    _marketplaceTotals.sent += amount;
    slot.state = SlotState.Paid;
    assert(token.transfer(slot.host, amount));
  }

  /// @notice Withdraws storage request funds back to the client that deposited them.
  /// @dev Request must be expired, must be in RequestState.New, and the transaction must originate from the depositer address.
  /// @param requestId the id of the request
  function withdrawFunds(RequestId requestId) public {
    Request storage request = _requests[requestId];
    if (block.timestamp <= request.expiry) {
      revert Marketplace_RequestNotYetTimedOut();
    }

    if (request.client != msg.sender) {
      revert Marketplace_InvalidClientAddress();
    }

    RequestContext storage context = _requestContexts[requestId];
    if (context.state != RequestState.New) {
      revert Marketplace_InvalidState();
    }

    // Update request state to Cancelled. Handle in the withdraw transaction
    // as there needs to be someone to pay for the gas to update the state
    context.state = RequestState.Cancelled;
    _removeFromMyRequests(request.client, requestId);

    emit RequestCancelled(requestId);

    uint256 amount = context.expiryFundsWithdraw;
    _marketplaceTotals.sent += amount;
    assert(token.transfer(msg.sender, amount));
  }

  function getActiveSlot(
    SlotId slotId
  ) public view slotIsNotFree(slotId) returns (ActiveSlot memory) {
    Slot storage slot = _slots[slotId];
    ActiveSlot memory activeSlot;
    activeSlot.request = _requests[slot.requestId];
    activeSlot.slotIndex = slot.slotIndex;
    return activeSlot;
  }

  modifier requestIsKnown(RequestId requestId) {
    if (_requests[requestId].client == address(0)) {
      revert Marketplace_UnknownRequest();
    }

    _;
  }

  function getRequest(
    RequestId requestId
  ) public view requestIsKnown(requestId) returns (Request memory) {
    return _requests[requestId];
  }

  modifier slotIsNotFree(SlotId slotId) {
    if (_slots[slotId].state == SlotState.Free) {
      revert Marketplace_SlotIsFree();
    }
    _;
  }

  function requestEnd(RequestId requestId) public view returns (uint256) {
    uint256 end = _requestContexts[requestId].endsAt;
    RequestState state = requestState(requestId);
    if (state == RequestState.New || state == RequestState.Started) {
      return end;
    } else {
      return Math.min(end, block.timestamp - 1);
    }
  }

  /// @notice Calculates the amount that should be payed out to a host if a request expires based on when the host fills the slot
  function _expiryPayoutAmount(
    RequestId requestId,
    uint256 startingTimestamp
  ) private view returns (uint256) {
    Request storage request = _requests[requestId];
    if (startingTimestamp >= request.expiry) {
      revert Marketplace_StartNotBeforeExpiry();
    }

    return (request.expiry - startingTimestamp) * request.ask.reward;
  }

  function getHost(SlotId slotId) public view returns (address) {
    return _slots[slotId].host;
  }

  function requestState(
    RequestId requestId
  ) public view requestIsKnown(requestId) returns (RequestState) {
    RequestContext storage context = _requestContexts[requestId];
    if (
      context.state == RequestState.New &&
      block.timestamp > _requests[requestId].expiry
    ) {
      return RequestState.Cancelled;
    } else if (
      context.state == RequestState.Started && block.timestamp > context.endsAt
    ) {
      return RequestState.Finished;
    } else {
      return context.state;
    }
  }

  function slotState(SlotId slotId) public view override returns (SlotState) {
    Slot storage slot = _slots[slotId];
    if (RequestId.unwrap(slot.requestId) == 0) {
      return SlotState.Free;
    }
    RequestState reqState = requestState(slot.requestId);
    if (slot.state == SlotState.Paid) {
      return SlotState.Paid;
    }
    if (reqState == RequestState.Cancelled) {
      return SlotState.Cancelled;
    }
    if (reqState == RequestState.Finished) {
      return SlotState.Finished;
    }
    if (reqState == RequestState.Failed) {
      return SlotState.Failed;
    }
    return slot.state;
  }

  function _transferFrom(address sender, uint256 amount) internal {
    address receiver = address(this);
    token.safeTransferFrom(sender, receiver, amount);
  }

  event StorageRequested(RequestId requestId, Ask ask, uint256 expiry);
  event RequestFulfilled(RequestId indexed requestId);
  event RequestFailed(RequestId indexed requestId);
  event SlotFilled(RequestId indexed requestId, uint256 slotIndex);
  event SlotFreed(RequestId indexed requestId, uint256 slotIndex);
  event RequestCancelled(RequestId indexed requestId);

  struct MarketplaceTotals {
    uint256 received;
    uint256 sent;
  }
}
