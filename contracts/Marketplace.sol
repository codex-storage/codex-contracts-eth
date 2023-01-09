// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./Requests.sol";
import "./Collateral.sol";
import "./Proofs.sol";

contract Marketplace is Collateral, Proofs {
  using EnumerableSet for EnumerableSet.Bytes32Set;

  uint256 public immutable collateral;
  uint256 public immutable minCollateralThreshold;
  uint256 public immutable slashMisses;
  uint256 public immutable slashPercentage;

  MarketplaceFunds private funds;
  mapping(RequestId => Request) private requests;
  mapping(RequestId => RequestContext) private requestContexts;
  mapping(SlotId => Slot) private slots;
  mapping(address => EnumerableSet.Bytes32Set) private requestsPerClient; // purchasing
  mapping(address => EnumerableSet.Bytes32Set) private slotsPerHost; // sales

  constructor(
    IERC20 _token,
    uint256 _collateral,
    uint256 _minCollateralThreshold,
    uint256 _slashMisses,
    uint256 _slashPercentage,
    uint256 _proofPeriod,
    uint256 _proofTimeout,
    uint8 _proofDowntime
  )
    Collateral(_token)
    Proofs(_proofPeriod, _proofTimeout, _proofDowntime)
    marketplaceInvariant
  {
    collateral = _collateral;
    minCollateralThreshold = _minCollateralThreshold;
    slashMisses = _slashMisses;
    slashPercentage = _slashPercentage;
  }

  function myRequests() public view returns (RequestId[] memory) {
    return _toRequestIds(requestsPerClient[msg.sender].values());
  }

  function mySlots() public view returns (SlotId[] memory) {
    return _toSlotIds(slotsPerHost[msg.sender].values());
  }

  function isWithdrawAllowed() internal view override returns (bool) {
    return slotsPerHost[msg.sender].length() == 0;
  }

  function _equals(RequestId a, RequestId b) internal pure returns (bool) {
    return RequestId.unwrap(a) == RequestId.unwrap(b);
  }

  function requestStorage(Request calldata request)
    public
    marketplaceInvariant
  {
    require(request.client == msg.sender, "Invalid client address");

    RequestId id = _toRequestId(request);
    require(requests[id].client == address(0), "Request already exists");

    requests[id] = request;
    RequestContext storage context = _context(id);
    // set contract end time to `duration` from now (time request was created)
    context.endsAt = block.timestamp + request.ask.duration;
    _setProofEnd(id, context.endsAt);

    requestsPerClient[request.client].add(RequestId.unwrap(id));

    uint256 amount = price(request);
    funds.received += amount;
    funds.balance += amount;
    transferFrom(msg.sender, amount);

    emit StorageRequested(id, request.ask);
  }

  function fillSlot(
    RequestId requestId,
    uint256 slotIndex,
    bytes calldata proof
  ) public requestMustAcceptProofs(requestId) marketplaceInvariant {
    Request storage request = _request(requestId);
    require(slotIndex < request.ask.slots, "Invalid slot");

    SlotId slotId = _toSlotId(requestId, slotIndex);
    Slot storage slot = slots[slotId];
    require(slot.host == address(0), "Slot already filled");

    require(balanceOf(msg.sender) >= collateral, "Insufficient collateral");

    _expectProofs(slotId, requestId, request.ask.proofProbability);
    submitProof(slotId, proof);

    slot.host = msg.sender;
    slot.requestId = requestId;
    RequestContext storage context = _context(requestId);
    context.slotsFilled += 1;

    slotsPerHost[slot.host].add(SlotId.unwrap(slotId));

    emit SlotFilled(requestId, slotIndex, slotId);
    if (context.slotsFilled == request.ask.slots) {
      context.state = RequestState.Started;
      context.startedAt = block.timestamp;
      emit RequestFulfilled(requestId);
    }
  }

  function freeSlot(SlotId slotId) public {
    Slot storage slot = _slot(slotId);
    require(slot.host == msg.sender, "Slot filled by other host");
    RequestState s = state(slot.requestId);
    if (s == RequestState.Finished || s == RequestState.Cancelled) {
      payoutSlot(slot.requestId, slotId);
    } else if (s == RequestState.Failed) {
      slotsPerHost[msg.sender].remove(SlotId.unwrap(slotId));
    } else {
      _forciblyFreeSlot(slotId);
    }
  }

  function markProofAsMissing(SlotId slotId, uint256 period)
    public
    slotMustAcceptProofs(slotId)
  {
    _markProofAsMissing(slotId, period);
    address host = _host(slotId);
    if (missingProofs(slotId) % slashMisses == 0) {
      _slash(host, slashPercentage);

      if (balanceOf(host) < minCollateralThreshold) {
        // When the collateral drops below the minimum threshold, the slot
        // needs to be freed so that there is enough remaining collateral to be
        // distributed for repairs and rewards (with any leftover to be burnt).
        _forciblyFreeSlot(slotId);
      }
    }
  }

  function _forciblyFreeSlot(SlotId slotId)
    internal
    slotMustAcceptProofs(slotId)
    marketplaceInvariant
  // TODO: restrict senders that can call this function
  {
    Slot storage slot = _slot(slotId);
    RequestId requestId = slot.requestId;
    RequestContext storage context = requestContexts[requestId];

    // TODO: burn host's slot collateral except for repair costs + mark proof
    // missing reward
    // Slot collateral is not yet implemented as the design decision was
    // not finalised.

    _unexpectProofs(slotId);

    slotsPerHost[slot.host].remove(SlotId.unwrap(slotId));

    slot.host = address(0);
    slot.requestId = RequestId.wrap(0);
    context.slotsFilled -= 1;
    emit SlotFreed(requestId, slotId);

    Request storage request = _request(requestId);
    uint256 slotsLost = request.ask.slots - context.slotsFilled;
    if (
      slotsLost > request.ask.maxSlotLoss &&
      context.state == RequestState.Started
    ) {
      context.state = RequestState.Failed;
      _setProofEnd(requestId, block.timestamp - 1);
      context.endsAt = block.timestamp - 1;
      emit RequestFailed(requestId);

      // TODO: burn all remaining slot collateral (note: slot collateral not
      // yet implemented)
      // TODO: send client remaining funds
    }
  }

  function payoutSlot(RequestId requestId, SlotId slotId)
    private
    marketplaceInvariant
  {
    require(
      _isFinished(requestId) || _isCancelled(requestId),
      "Contract not ended"
    );
    RequestContext storage context = _context(requestId);
    Request storage request = _request(requestId);
    context.state = RequestState.Finished;
    requestsPerClient[request.client].remove(RequestId.unwrap(requestId));
    Slot storage slot = _slot(slotId);
    require(!slot.hostPaid, "Already paid");

    slotsPerHost[slot.host].remove(SlotId.unwrap(slotId));

    uint256 amount = pricePerSlot(requests[requestId]);
    funds.sent += amount;
    funds.balance -= amount;
    slot.hostPaid = true;
    require(token.transfer(slot.host, amount), "Payment failed");
  }

  /// @notice Withdraws storage request funds back to the client that deposited them.
  /// @dev Request must be expired, must be in RequestState.New, and the transaction must originate from the depositer address.
  /// @param requestId the id of the request
  function withdrawFunds(RequestId requestId) public marketplaceInvariant {
    Request storage request = requests[requestId];
    require(block.timestamp > request.expiry, "Request not yet timed out");
    require(request.client == msg.sender, "Invalid client address");
    RequestContext storage context = _context(requestId);
    require(context.state == RequestState.New, "Invalid state");

    // Update request state to Cancelled. Handle in the withdraw transaction
    // as there needs to be someone to pay for the gas to update the state
    context.state = RequestState.Cancelled;
    requestsPerClient[request.client].remove(RequestId.unwrap(requestId));

    emit RequestCancelled(requestId);

    // TODO: To be changed once we start paying out hosts for the time they
    // fill a slot. The amount that we paid to hosts will then have to be
    // deducted from the price.
    uint256 amount = _price(request);
    funds.sent += amount;
    funds.balance -= amount;
    require(token.transfer(msg.sender, amount), "Withdraw failed");
  }

  /// @notice Return true if the request state is RequestState.Cancelled or if the request expiry time has elapsed and the request was never started.
  /// @dev Handles the case when a request may have been cancelled, but the client has not withdrawn its funds yet, and therefore the state has not yet been updated.
  /// @param requestId the id of the request
  /// @return true if request is cancelled
  function _isCancelled(RequestId requestId) internal view returns (bool) {
    RequestContext storage context = _context(requestId);
    return
      context.state == RequestState.Cancelled ||
      (context.state == RequestState.New &&
        block.timestamp > _request(requestId).expiry);
  }

  /// @notice Return true if the request state is RequestState.Finished or if the request duration has elapsed and the request was started.
  /// @dev Handles the case when a request may have been finished, but the state has not yet been updated by a transaction.
  /// @param requestId the id of the request
  /// @return true if request is finished
  function _isFinished(RequestId requestId) internal view returns (bool) {
    RequestContext memory context = _context(requestId);
    return
      context.state == RequestState.Finished ||
      (context.state == RequestState.Started &&
        block.timestamp > context.endsAt);
  }

  /// @notice Return id of request that slot belongs to
  /// @dev Returns requestId that is mapped to the slotId
  /// @param slotId id of the slot
  /// @return if of the request the slot belongs to
  function _getRequestIdForSlot(SlotId slotId)
    internal
    view
    returns (RequestId)
  {
    Slot memory slot = _slot(slotId);
    require(_notEqual(slot.requestId, 0), "Missing request id");
    return slot.requestId;
  }

  /// @notice Return true if the request state the slot belongs to is RequestState.Cancelled or if the request expiry time has elapsed and the request was never started.
  /// @dev Handles the case when a request may have been cancelled, but the client has not withdrawn its funds yet, and therefore the state has not yet been updated.
  /// @param slotId the id of the slot
  /// @return true if request is cancelled
  function _isSlotCancelled(SlotId slotId) internal view returns (bool) {
    RequestId requestId = _getRequestIdForSlot(slotId);
    return _isCancelled(requestId);
  }

  function _host(SlotId slotId) internal view returns (address) {
    return slots[slotId].host;
  }

  function getHost(SlotId slotId) public view returns (address) {
    return _host(slotId);
  }

  function _request(RequestId requestId)
    internal
    view
    returns (Request storage)
  {
    Request storage request = requests[requestId];
    require(request.client != address(0), "Unknown request");
    return request;
  }

  function getRequest(RequestId requestId)
    public
    view
    returns (Request memory)
  {
    return _request(requestId);
  }

  function _slot(SlotId slotId) internal view returns (Slot storage) {
    Slot storage slot = slots[slotId];
    require(slot.host != address(0), "Slot empty");
    return slot;
  }

  function _context(RequestId requestId)
    internal
    view
    returns (RequestContext storage)
  {
    return requestContexts[requestId];
  }

  function proofPeriod() public view returns (uint256) {
    return _period();
  }

  function proofTimeout() public view returns (uint256) {
    return _timeout();
  }

  function proofEnd(SlotId slotId) public view returns (uint256) {
    return requestEnd(_slot(slotId).requestId);
  }

  function requestEnd(RequestId requestId) public view returns (uint256) {
    uint256 end = _end(requestId);
    if (_requestAcceptsProofs(requestId)) {
      return end;
    } else {
      return Math.min(end, block.timestamp - 1);
    }
  }

  function isProofRequired(SlotId slotId) public view returns (bool) {
    if (!_slotAcceptsProofs(slotId)) {
      return false;
    }
    return _isProofRequired(slotId);
  }

  function willProofBeRequired(SlotId slotId) public view returns (bool) {
    if (!_slotAcceptsProofs(slotId)) {
      return false;
    }
    return _willProofBeRequired(slotId);
  }

  function getChallenge(SlotId slotId) public view returns (bytes32) {
    if (!_slotAcceptsProofs(slotId)) {
      return bytes32(0);
    }
    return _getChallenge(slotId);
  }

  function getPointer(SlotId slotId) public view returns (uint8) {
    return _getPointer(slotId);
  }

  function _price(
    uint64 numSlots,
    uint256 duration,
    uint256 reward
  ) internal pure returns (uint256) {
    return numSlots * duration * reward;
  }

  function _price(Request memory request) internal pure returns (uint256) {
    return _price(request.ask.slots, request.ask.duration, request.ask.reward);
  }

  function price(Request calldata request) private pure returns (uint256) {
    return _price(request.ask.slots, request.ask.duration, request.ask.reward);
  }

  function pricePerSlot(Request memory request) private pure returns (uint256) {
    return request.ask.duration * request.ask.reward;
  }

  function state(RequestId requestId) public view returns (RequestState) {
    if (_isCancelled(requestId)) {
      return RequestState.Cancelled;
    } else if (_isFinished(requestId)) {
      return RequestState.Finished;
    } else {
      RequestContext storage context = _context(requestId);
      return context.state;
    }
  }

  /// @notice returns true when the request is accepting proof submissions from hosts occupying slots.
  /// @dev Request state must be new or started, and must not be cancelled, finished, or failed.
  /// @param slotId id of the slot, that is mapped to a request, for which to obtain state info
  function _slotAcceptsProofs(SlotId slotId) internal view returns (bool) {
    RequestId requestId = _getRequestIdForSlot(slotId);
    return _requestAcceptsProofs(requestId);
  }

  /// @notice returns true when the request is accepting proof submissions from hosts occupying slots.
  /// @dev Request state must be new or started, and must not be cancelled, finished, or failed.
  /// @param requestId id of the request for which to obtain state info
  function _requestAcceptsProofs(RequestId requestId)
    internal
    view
    returns (bool)
  {
    RequestState s = state(requestId);
    return s == RequestState.New || s == RequestState.Started;
  }

  function _toRequestId(Request memory request)
    internal
    pure
    returns (RequestId)
  {
    return RequestId.wrap(keccak256(abi.encode(request)));
  }

  function _toRequestIds(bytes32[] memory array)
    private
    pure
    returns (RequestId[] memory result)
  {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      result := array
    }
  }

  function _toSlotIds(bytes32[] memory array)
    private
    pure
    returns (SlotId[] memory result)
  {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      result := array
    }
  }

  function _toBytes32s(RequestId[] memory array)
    private
    pure
    returns (bytes32[] memory result)
  {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      result := array
    }
  }

  function _toSlotId(RequestId requestId, uint256 slotIndex)
    internal
    pure
    returns (SlotId)
  {
    return SlotId.wrap(keccak256(abi.encode(requestId, slotIndex)));
  }

  function _notEqual(RequestId a, uint256 b) internal pure returns (bool) {
    return RequestId.unwrap(a) != bytes32(b);
  }

  enum RequestState {
    New, // [default] waiting to fill slots
    Started, // all slots filled, accepting regular proofs
    Cancelled, // not enough slots filled before expiry
    Finished, // successfully completed
    Failed // too many nodes have failed to provide proofs, data lost
  }

  struct RequestContext {
    uint256 slotsFilled;
    RequestState state;
    uint256 startedAt;
    uint256 endsAt;
  }

  struct Slot {
    address host;
    bool hostPaid;
    RequestId requestId;
  }

  event StorageRequested(RequestId requestId, Ask ask);
  event RequestFulfilled(RequestId indexed requestId);
  event RequestFailed(RequestId indexed requestId);
  event SlotFilled(
    RequestId indexed requestId,
    uint256 indexed slotIndex,
    SlotId slotId
  );
  event SlotFreed(RequestId indexed requestId, SlotId slotId);
  event RequestCancelled(RequestId indexed requestId);

  modifier marketplaceInvariant() {
    MarketplaceFunds memory oldFunds = funds;
    _;
    assert(funds.received >= oldFunds.received);
    assert(funds.sent >= oldFunds.sent);
    assert(funds.received == funds.balance + funds.sent);
  }

  /// @notice Modifier that requires the request state to be that which is accepting proof submissions from hosts occupying slots.
  /// @dev Request state must be new or started, and must not be cancelled, finished, or failed.
  /// @param slotId id of the slot, that is mapped to a request, for which to obtain state info
  modifier slotMustAcceptProofs(SlotId slotId) {
    RequestId requestId = _getRequestIdForSlot(slotId);
    require(_requestAcceptsProofs(requestId), "Slot not accepting proofs");
    _;
  }

  /// @notice Modifier that requires the request state to be that which is accepting proof submissions from hosts occupying slots.
  /// @dev Request state must be new or started, and must not be cancelled, finished, or failed.
  /// @param requestId id of the request, for which to obtain state info
  modifier requestMustAcceptProofs(RequestId requestId) {
    require(_requestAcceptsProofs(requestId), "Request not accepting proofs");
    _;
  }

  struct MarketplaceFunds {
    uint256 balance;
    uint256 received;
    uint256 sent;
  }
}
