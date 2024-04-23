// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./Configuration.sol";
import "./Requests.sol";
import "./Proofs.sol";
import "./StateRetrieval.sol";
import "./Endian.sol";
import "./Groth16.sol";
import "hardhat/console.sol";

contract Marketplace is Proofs, StateRetrieval, Endian {
  using EnumerableSet for EnumerableSet.Bytes32Set;
  using Requests for Request;

  IERC20 private immutable _token;
  MarketplaceConfig private _config;

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
    uint256 expiresAt;
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
    MarketplaceConfig memory configuration,
    IERC20 token_,
    IGroth16Verifier verifier
  ) Proofs(configuration.proofs, verifier) {
    _token = token_;

    require(
      configuration.collateral.repairRewardPercentage <= 100,
      "Must be less than 100"
    );
    require(
      configuration.collateral.slashPercentage <= 100,
      "Must be less than 100"
    );
    require(
      configuration.collateral.maxNumberOfSlashes *
        configuration.collateral.slashPercentage <=
        100,
      "Maximum slashing exceeds 100%"
    );
    _config = configuration;
  }

  function config() public view returns (MarketplaceConfig memory) {
    return _config;
  }

  function token() public view returns (IERC20) {
    return _token;
  }

  function requestStorage(Request calldata request) public {
    require(request.client == msg.sender, "Invalid client address");

    RequestId id = request.id();
    require(_requests[id].client == address(0), "Request already exists");
    require(
      request.expiry > 0 && request.expiry < request.ask.duration,
      "Expiry not between 0 and duration"
    );

    console.log(block.timestamp);
    console.log(request.expiry);
    _requests[id] = request;
    _requestContexts[id].endsAt = block.timestamp + request.ask.duration;
    _requestContexts[id].expiresAt = block.timestamp + request.expiry;

    _addToMyRequests(request.client, id);

    uint256 amount = request.price();
    _requestContexts[id].expiryFundsWithdraw = amount;
    _marketplaceTotals.received += amount;
    _transferFrom(msg.sender, amount);

    emit StorageRequested(id, request.ask, _requestContexts[id].expiresAt);
  }

  function fillSlot(
    RequestId requestId,
    uint256 slotIndex,
    Groth16Proof calldata proof
  ) public requestIsKnown(requestId) {
    Request storage request = _requests[requestId];
    require(slotIndex < request.ask.slots, "Invalid slot");

    SlotId slotId = Requests.slotId(requestId, slotIndex);
    Slot storage slot = _slots[slotId];
    slot.requestId = requestId;
    slot.slotIndex = slotIndex;

    require(slotState(slotId) == SlotState.Free, "Slot is not free");

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
    require(slot.host == msg.sender, "Slot filled by other host");
    SlotState state = slotState(slotId);
    require(state != SlotState.Paid, "Already paid");

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

  function _challengeToFieldElement(
    bytes32 challenge
  ) internal pure returns (uint256) {
    // use only 31 bytes of the challenge to ensure that it fits into the field
    bytes32 truncated = bytes32(bytes31(challenge));
    // convert from little endian to big endian
    bytes32 bigEndian = _byteSwap(truncated);
    // convert bytes to integer
    return uint256(bigEndian);
  }

  function _merkleRootToFieldElement(
    bytes32 merkleRoot
  ) internal pure returns (uint256) {
    // convert from little endian to big endian
    bytes32 bigEndian = _byteSwap(merkleRoot);
    // convert bytes to integer
    return uint256(bigEndian);
  }

  function submitProof(
    SlotId id,
    Groth16Proof calldata proof
  ) public requestIsKnown(_slots[id].requestId) {
    Slot storage slot = _slots[id];
    Request storage request = _requests[slot.requestId];
    uint256[] memory pubSignals = new uint256[](3);
    pubSignals[0] = _challengeToFieldElement(getChallenge(id));
    pubSignals[1] = _merkleRootToFieldElement(request.content.merkleRoot);
    pubSignals[2] = slot.slotIndex;
    _proofReceived(id, proof, pubSignals);
  }

  function markProofAsMissing(SlotId slotId, Period period) public {
    require(slotState(slotId) == SlotState.Filled, "Slot not accepting proofs");
    _markProofAsMissing(slotId, period);
    Slot storage slot = _slots[slotId];
    Request storage request = _requests[slot.requestId];

    if (missingProofs(slotId) % _config.collateral.slashCriterion == 0) {
      uint256 slashedAmount = (request.ask.collateral *
        _config.collateral.slashPercentage) / 100;
      slot.currentCollateral -= slashedAmount;
      if (
        missingProofs(slotId) / _config.collateral.slashCriterion >=
        _config.collateral.maxNumberOfSlashes
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
    assert(_token.transfer(slot.host, amount));
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
    assert(_token.transfer(slot.host, amount));
  }

  /// @notice Withdraws storage request funds back to the client that deposited them.
  /// @dev Request must be expired, must be in RequestState.New, and the transaction must originate from the depositer address.
  /// @param requestId the id of the request
  function withdrawFunds(RequestId requestId) public {
    Request storage request = _requests[requestId];
    require(
      block.timestamp > requestExpiry(requestId),
      "Request not yet timed out"
    );
    require(request.client == msg.sender, "Invalid client address");
    RequestContext storage context = _requestContexts[requestId];
    require(context.state == RequestState.New, "Invalid state");

    // Update request state to Cancelled. Handle in the withdraw transaction
    // as there needs to be someone to pay for the gas to update the state
    context.state = RequestState.Cancelled;
    _removeFromMyRequests(request.client, requestId);

    emit RequestCancelled(requestId);

    uint256 amount = context.expiryFundsWithdraw;
    _marketplaceTotals.sent += amount;
    assert(_token.transfer(msg.sender, amount));
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
    require(_requests[requestId].client != address(0), "Unknown request");
    _;
  }

  function getRequest(
    RequestId requestId
  ) public view requestIsKnown(requestId) returns (Request memory) {
    return _requests[requestId];
  }

  modifier slotIsNotFree(SlotId slotId) {
    require(_slots[slotId].state != SlotState.Free, "Slot is free");
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

  function requestExpiry(RequestId requestId) public view returns (uint256) {
    return _requestContexts[requestId].expiresAt;
  }

  /// @notice Calculates the amount that should be payed out to a host if a request expires based on when the host fills the slot
  function _expiryPayoutAmount(
    RequestId requestId,
    uint256 startingTimestamp
  ) private view returns (uint256) {
    Request storage request = _requests[requestId];
    require(
      startingTimestamp < requestExpiry(requestId),
      "Start not before expiry"
    );

    return (requestExpiry(requestId) - startingTimestamp) * request.ask.reward;
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
      block.timestamp > requestExpiry(requestId)
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
    require(_token.transferFrom(sender, receiver, amount), "Transfer failed");
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
