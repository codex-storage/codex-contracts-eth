// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./Configuration.sol";
import "./Requests.sol";
import "./Proofs.sol";
import "./SlotReservations.sol";
import "./StateRetrieval.sol";
import "./Endian.sol";
import "./Groth16.sol";

contract Marketplace is SlotReservations, Proofs, StateRetrieval, Endian {
  using EnumerableSet for EnumerableSet.Bytes32Set;
  using EnumerableSet for EnumerableSet.AddressSet;
  using Requests for Request;

  IERC20 private immutable _token;
  MarketplaceConfig private _config;

  mapping(RequestId => Request) private _requests;
  mapping(RequestId => RequestContext) internal _requestContexts;
  mapping(SlotId => Slot) internal _slots;

  MarketplaceTotals internal _marketplaceTotals;

  struct RequestContext {
    RequestState state;
    uint256 slotsFilled;
    /// @notice Tracks how much funds should be returned to the client as not all funds might be used for hosting the request
    /// @dev The sum starts with the full reward amount for the request and is reduced every time a host fills a slot.
    ///      The reduction is calculated from the duration of time between the slot being filled and the request's end.
    ///      This is the amount that will be paid out to the host when the request successfully finishes.
    /// @dev fundsToReturnToClient == 0 is used to signal that after request is terminated all the remaining funds were withdrawn.
    ///      This is possible, because technically it is not possible for this variable to reach 0 in "natural" way as
    ///      that would require all the slots to be filled at the same block as the request was created.
    uint256 fundsToReturnToClient;
    uint256 startedAt;
    uint256 endsAt;
    uint256 expiresAt;
  }

  struct Slot {
    SlotState state;
    RequestId requestId;
    /// @notice Timestamp that signals when slot was filled
    /// @dev Used for calculating payouts as hosts are paid based on time they actually host the content
    uint256 filledAt;
    uint256 slotIndex;
    /// @notice Tracks the current amount of host's collateral that is to be payed out at the end of Slot's lifespan.
    /// @dev When Slot is filled, the collateral is collected in amount of request.ask.collateral
    /// @dev When Host is slashed for missing a proof the slashed amount is reflected in this variable
    uint256 currentCollateral;
    address host; // address used for collateral interactions and identifying hosts
  }

  struct ActiveSlot {
    Request request;
    uint256 slotIndex;
  }

  constructor(
    MarketplaceConfig memory configuration,
    IERC20 token_,
    IGroth16Verifier verifier
  )
    SlotReservations(configuration.reservations)
    Proofs(configuration.proofs, verifier)
  {
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

  function configuration() public view returns (MarketplaceConfig memory) {
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
      "Expiry not in range"
    );
    require(request.ask.slots > 0, "Insufficient slots");
    require(
      request.ask.maxSlotLoss <= request.ask.slots,
      "maxSlotLoss exceeds slots"
    );

    _requests[id] = request;
    _requestContexts[id].endsAt = block.timestamp + request.ask.duration;
    _requestContexts[id].expiresAt = block.timestamp + request.expiry;

    _addToMyRequests(request.client, id);

    uint256 amount = request.maxPrice();
    _requestContexts[id].fundsToReturnToClient = amount;
    _marketplaceTotals.received += amount;
    _transferFrom(msg.sender, amount);

    emit StorageRequested(id, request.ask, _requestContexts[id].expiresAt);
  }

  /**
   * @notice Fills a slot. Reverts if an invalid proof of the slot data is
     provided.
   * @param requestId RequestId identifying the request containing the slot to
     fill.
   * @param slotIndex Index of the slot in the request.
   * @param proof Groth16 proof procing possession of the slot data.
   */
  function fillSlot(
    RequestId requestId,
    uint256 slotIndex,
    Groth16Proof calldata proof
  ) public requestIsKnown(requestId) {
    Request storage request = _requests[requestId];
    require(slotIndex < request.ask.slots, "Invalid slot");

    SlotId slotId = Requests.slotId(requestId, slotIndex);
    require(_reservations[slotId].contains(msg.sender), "Reservation required");

    Slot storage slot = _slots[slotId];
    slot.requestId = requestId;
    slot.slotIndex = slotIndex;
    RequestContext storage context = _requestContexts[requestId];

    require(slotState(slotId) == SlotState.Free, "Slot is not free");

    _startRequiringProofs(slotId, request.ask.proofProbability);
    submitProof(slotId, proof);

    slot.host = msg.sender;
    slot.state = SlotState.Filled;
    slot.filledAt = block.timestamp;

    context.slotsFilled += 1;
    context.fundsToReturnToClient -= _slotPayout(requestId, slot.filledAt);

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

  /**
   * @notice Frees a slot, paying out rewards and returning collateral for
     finished or cancelled requests to the host that has filled the slot.
   * @param slotId id of the slot to free
   * @dev The host that filled the slot must have initiated the transaction
     (msg.sender). This overload allows `rewardRecipient` and
     `collateralRecipient` to be optional.
   */
  function freeSlot(SlotId slotId) public slotIsNotFree(slotId) {
    return freeSlot(slotId, msg.sender, msg.sender);
  }

  /**
   * @notice Frees a slot, paying out rewards and returning collateral for
     finished or cancelled requests.
   * @param slotId id of the slot to free
   * @param rewardRecipient address to send rewards to
   * @param collateralRecipient address to refund collateral to
   */
  function freeSlot(
    SlotId slotId,
    address rewardRecipient,
    address collateralRecipient
  ) public slotIsNotFree(slotId) {
    Slot storage slot = _slots[slotId];
    require(slot.host == msg.sender, "Slot filled by other host");
    SlotState state = slotState(slotId);
    require(state != SlotState.Paid, "Already paid");

    if (state == SlotState.Finished) {
      _payoutSlot(slot.requestId, slotId, rewardRecipient, collateralRecipient);
    } else if (state == SlotState.Cancelled) {
      _payoutCancelledSlot(
        slot.requestId,
        slotId,
        rewardRecipient,
        collateralRecipient
      );
    } else if (state == SlotState.Failed) {
      _removeFromMySlots(msg.sender, slotId);
    } else if (state == SlotState.Filled) {
      // free slot without returning collateral, effectively a 100% slash
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

    // TODO: Reward for validator that calls this function

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

  /**
   * @notice Abandons the slot without returning collateral, effectively slashing the
     entire collateral.
   * @param slotId SlotId of the slot to free.
   * @dev _slots[slotId] is deleted, resetting _slots[slotId].currentCollateral
     to 0.
  */
  function _forciblyFreeSlot(SlotId slotId) internal {
    Slot storage slot = _slots[slotId];
    RequestId requestId = slot.requestId;
    RequestContext storage context = _requestContexts[requestId];

    // We need to refund the amount of payout of the current node to the `fundsToReturnToClient` so
    // we keep correctly the track of the funds that needs to be returned at the end.
    context.fundsToReturnToClient += _slotPayout(requestId, slot.filledAt);

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
    }
  }

  function _payoutSlot(
    RequestId requestId,
    SlotId slotId,
    address rewardRecipient,
    address collateralRecipient
  ) private requestIsKnown(requestId) {
    RequestContext storage context = _requestContexts[requestId];
    Request storage request = _requests[requestId];
    context.state = RequestState.Finished;
    Slot storage slot = _slots[slotId];

    _removeFromMyRequests(request.client, requestId);
    _removeFromMySlots(slot.host, slotId);

    uint256 payoutAmount = _slotPayout(requestId, slot.filledAt);
    uint256 collateralAmount = slot.currentCollateral;
    _marketplaceTotals.sent += (payoutAmount + collateralAmount);
    slot.state = SlotState.Paid;
    assert(_token.transfer(rewardRecipient, payoutAmount));
    assert(_token.transfer(collateralRecipient, collateralAmount));
  }

  /**
   * @notice Pays out a host for duration of time that the slot was filled, and
     returns the collateral.
   * @dev The payouts are sent to the rewardRecipient, and collateral is returned
     to the host address.
   * @param requestId RequestId of the request that contains the slot to be paid
     out.
   * @param slotId SlotId of the slot to be paid out.
   */
  function _payoutCancelledSlot(
    RequestId requestId,
    SlotId slotId,
    address rewardRecipient,
    address collateralRecipient
  ) private requestIsKnown(requestId) {
    Slot storage slot = _slots[slotId];
    _removeFromMySlots(slot.host, slotId);

    uint256 payoutAmount = _slotPayout(
      requestId,
      slot.filledAt,
      requestExpiry(requestId)
    );
    uint256 collateralAmount = slot.currentCollateral;
    _marketplaceTotals.sent += (payoutAmount + collateralAmount);
    slot.state = SlotState.Paid;
    assert(_token.transfer(rewardRecipient, payoutAmount));
    assert(_token.transfer(collateralRecipient, collateralAmount));
  }

  /**
   * @notice Withdraws remaining storage request funds back to the client that
     deposited them.
   * @dev Request must be cancelled, failed or finished, and the
     transaction must originate from the depositor address.
   * @param requestId the id of the request
   */
  function withdrawFunds(RequestId requestId) public {
    withdrawFunds(requestId, msg.sender);
  }

  /**
   * @notice Withdraws storage request funds to the provided address.
   * @dev Request must be expired, must be in RequestState.New, and the
     transaction must originate from the depositer address.
   * @param requestId the id of the request
   * @param withdrawRecipient address to return the remaining funds to
   */
  function withdrawFunds(
    RequestId requestId,
    address withdrawRecipient
  ) public {
    Request storage request = _requests[requestId];
    require(request.client == msg.sender, "Invalid client address");
    RequestContext storage context = _requestContexts[requestId];
    RequestState state = requestState(requestId);
    require(
      state == RequestState.Cancelled ||
        state == RequestState.Failed ||
        state == RequestState.Finished,
      "Invalid state"
    );

    // fundsToReturnToClient == 0 is used for "double-spend" protection, once the funds are withdrawn
    // then this variable is set to 0.
    require(context.fundsToReturnToClient != 0, "Nothing to withdraw");

    if (state == RequestState.Cancelled) {
      context.state = RequestState.Cancelled;
      emit RequestCancelled(requestId);

      // `fundsToReturnToClient` currently tracks funds to be returned for requests that successfully finish.
      // When requests are cancelled, funds earmarked for payment for the duration
      // between request expiry and request end (for every slot that was filled), should be returned to the client.
      // Update `fundsToReturnToClient` to reflect this.
      context.fundsToReturnToClient +=
        context.slotsFilled *
        _slotPayout(requestId, requestExpiry(requestId));
    } else if (state == RequestState.Failed) {
      // For Failed requests the client is refunded whole amount.
      context.fundsToReturnToClient = request.maxPrice();
    } else {
      context.state = RequestState.Finished;
    }

    _removeFromMyRequests(request.client, requestId);

    uint256 amount = context.fundsToReturnToClient;
    _marketplaceTotals.sent += amount;
    assert(_token.transfer(withdrawRecipient, amount));

    // We zero out the funds tracking in order to prevent double-spends
    context.fundsToReturnToClient = 0;
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

  /**
   * @notice Calculates the amount that should be paid out to a host that successfully finished the request
   * @param requestId RequestId of the request used to calculate the payout
   * amount.
   * @param startingTimestamp timestamp indicating when a host filled a slot and
   * started providing proofs.
   */
  function _slotPayout(
    RequestId requestId,
    uint256 startingTimestamp
  ) private view returns (uint256) {
    return
      _slotPayout(
        requestId,
        startingTimestamp,
        _requestContexts[requestId].endsAt
      );
  }

  /// @notice Calculates the amount that should be paid out to a host based on the specified time frame.
  function _slotPayout(
    RequestId requestId,
    uint256 startingTimestamp,
    uint256 endingTimestamp
  ) private view returns (uint256) {
    Request storage request = _requests[requestId];
    require(startingTimestamp < endingTimestamp, "Start not before expiry");

    return (endingTimestamp - startingTimestamp) * request.ask.reward;
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
      (context.state == RequestState.Started ||
        context.state == RequestState.New) && block.timestamp > context.endsAt
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
