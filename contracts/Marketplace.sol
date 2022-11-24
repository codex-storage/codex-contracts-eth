// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Collateral.sol";
import "./Proofs.sol";
import "./libs/Utils.sol";
import "./libs/Mappings.sol";

contract Marketplace is Collateral, Proofs {
  using Mappings for Mappings.Mapping;

  type RequestId is bytes32;
  type SlotId is bytes32;

  uint256 public immutable collateral;
  MarketplaceFunds private funds;
  mapping(RequestId => Request) private requests;
  mapping(RequestId => RequestContext) private requestContexts;
  mapping(SlotId => Slot) private slots;

  // PURCHASING
  // address => RequestId
  Mappings.Mapping private activeClientRequests;

  // SALES
  // address => RequestId
  Mappings.Mapping private activeHostRequests;
  // RequestId => SlotId
  Mappings.Mapping private activeRequestSlots;


  constructor(
    IERC20 _token,
    uint256 _collateral,
    uint256 _proofPeriod,
    uint256 _proofTimeout,
    uint8 _proofDowntime
  )
    Collateral(_token)
    Proofs(_proofPeriod, _proofTimeout, _proofDowntime)
    marketplaceInvariant
  {
    collateral = _collateral;
  }

  function myRequests() public view returns (RequestId[] memory) {
    Mappings.ValueId[] storage valueIds =
      activeClientRequests.getValueIds(Mappings.toKeyId(msg.sender));
    return _toRequestIds(valueIds);
  }

  function mySlots()
    public
    view
    returns (SlotId[] memory)
  {
    uint256 counter = 0;
    uint256 totalSlots = activeRequestSlots.getManyCount(); // set this bigger than our possible filtered list size
    if (totalSlots == 0) {
      return new SlotId[](0);
    }
    bytes32[] memory result = new bytes32[](totalSlots);
    Mappings.ValueId[] storage valueIds =
      activeHostRequests.getValueIds(Mappings.toKeyId(msg.sender));
    for (uint256 i = 0; i < valueIds.length; i++) {
      // There may exist slots that are still "active", but are part of a request
      // that is expired but has not been set to the cancelled state yet. In that
      // case, return an empty array.
      Mappings.KeyId keyId = Mappings.toKeyId(valueIds[i]);
      if (activeRequestSlots.keyExists(keyId)) {
        Mappings.ValueId[] storage slotIds =
          activeRequestSlots.getValueIds(keyId);
        for (uint256 j = 0; j < slotIds.length; j++) {
          result[counter] = Mappings.ValueId.unwrap(slotIds[j]);
          counter++;
        }
      }
    }
    return _toSlotIds(Utils._resize(result, counter));
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
    _setProofEnd(_toEndId(id), context.endsAt);

    Mappings.KeyId addrBytes32 = Mappings.toKeyId(request.client);
    activeClientRequests.insert(addrBytes32, _toValueId(id));

    Mappings.KeyId keyId = _toKeyId(id);
    if (!activeRequestSlots.keyExists(keyId)) {
      activeRequestSlots.insertKey(keyId);
    }

    _createLock(_toLockId(id), request.expiry);

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
    LockId lockId = _toLockId(requestId);
    _lock(msg.sender, lockId);

    ProofId proofId = _toProofId(slotId);
    _expectProofs(proofId, _toEndId(requestId), request.ask.proofProbability);
    _submitProof(proofId, proof);

    slot.host = msg.sender;
    slot.requestId = requestId;
    RequestContext storage context = _context(requestId);
    context.slotsFilled += 1;

    Mappings.KeyId sender = Mappings.toKeyId(msg.sender);
    // address => RequestId
    activeHostRequests.insert(sender, _toValueId(requestId));

    // RequestId => SlotId
    activeRequestSlots.insert(_toKeyId(requestId), _toValueId(slotId));

    emit SlotFilled(requestId, slotIndex, slotId);
    if (context.slotsFilled == request.ask.slots) {
      context.state = RequestState.Started;
      context.startedAt = block.timestamp;
      _extendLockExpiryTo(lockId, context.endsAt);
      emit RequestFulfilled(requestId);
    }
  }

  function _freeSlot(SlotId slotId)
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

    _unexpectProofs(_toProofId(slotId));

    Mappings.ValueId valueId = _toValueId(slotId);
    if (activeRequestSlots.valueExists(valueId)) {
      activeRequestSlots.deleteValue(valueId);
    }
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
      _setProofEnd(_toEndId(requestId), block.timestamp - 1);
      context.endsAt = block.timestamp - 1;
      activeClientRequests.deleteValue(_toValueId(requestId));
      activeRequestSlots.clearValues(_toKeyId(requestId));
      emit RequestFailed(requestId);

      // TODO: burn all remaining slot collateral (note: slot collateral not
      // yet implemented)
      // TODO: send client remaining funds
    }
  }

  function payoutSlot(RequestId requestId, uint256 slotIndex)
    public
    marketplaceInvariant
  {
    require(_isFinished(requestId), "Contract not ended");
    RequestContext storage context = _context(requestId);
    // Request storage request = _request(requestId);
    context.state = RequestState.Finished;
    Mappings.ValueId valueId = _toValueId(requestId);
    if (activeClientRequests.valueExists(valueId)) {
      activeClientRequests.deleteValue(valueId);
    }
    SlotId slotId = _toSlotId(requestId, slotIndex);
    Slot storage slot = _slot(slotId);
    require(!slot.hostPaid, "Already paid");
    activeRequestSlots.deleteValue(_toValueId(slotId));
    if (activeRequestSlots.getManyCount() == 0) {
      activeRequestSlots.deleteKey(_toKeyId(requestId));
      activeHostRequests.deleteValue(valueId);
    }
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
    activeClientRequests.deleteValue(_toValueId(requestId));
    activeRequestSlots.clearValues(_toKeyId(requestId));
    // TODO: handle dangling RequestId in activeHostRequests (for address)
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

  function _request(RequestId requestId)
    internal
    view
    returns (Request storage)
  {
    Request storage request = requests[requestId];
    require(request.client != address(0), "Unknown request");
    return request;
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
    uint256 end = _end(_toEndId(requestId));
    if (_requestAcceptsProofs(requestId)) {
      return end;
    } else {
      return Math.min(end, block.timestamp - 1);
    }
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

  function _toRequestId(Mappings.ValueId valueId)
    internal
    pure
    returns (RequestId)
  {
    return RequestId.wrap(Mappings.ValueId.unwrap(valueId));
  }

  function _toRequestIds(Mappings.ValueId[] memory array)
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

  function _toSlotId(RequestId requestId, uint256 slotIndex)
    internal
    pure
    returns (SlotId)
  {
    return SlotId.wrap(keccak256(abi.encode(requestId, slotIndex)));
  }

  function _toLockId(RequestId requestId) internal pure returns (LockId) {
    return LockId.wrap(RequestId.unwrap(requestId));
  }

  function _toProofId(SlotId slotId) internal pure returns (ProofId) {
    return ProofId.wrap(SlotId.unwrap(slotId));
  }

  function _toEndId(RequestId requestId) internal pure returns (EndId) {
    return EndId.wrap(RequestId.unwrap(requestId));
  }

  function _toKeyId(RequestId requestId)
    internal
    pure
    returns (Mappings.KeyId)
  {
    return Mappings.KeyId.wrap(RequestId.unwrap(requestId));
  }

  function _toValueId(RequestId requestId)
    internal
    pure
    returns (Mappings.ValueId)
  {
    return Mappings.ValueId.wrap(RequestId.unwrap(requestId));
  }

  function _toValueId(SlotId slotId)
    internal
    pure
    returns (Mappings.ValueId)
  {
    return Mappings.ValueId.wrap(SlotId.unwrap(slotId));
  }

  function _notEqual(RequestId a, uint256 b) internal pure returns (bool) {
    return RequestId.unwrap(a) != bytes32(b);
  }

  struct Request {
    address client;
    Ask ask;
    Content content;
    uint256 expiry; // time at which this request expires
    bytes32 nonce; // random nonce to differentiate between similar requests
  }

  struct Ask {
    uint64 slots; // the number of requested slots
    uint256 slotSize; // amount of storage per slot (in number of bytes)
    uint256 duration; // how long content should be stored (in seconds)
    uint256 proofProbability; // how often storage proofs are required
    uint256 reward; // amount of tokens paid per second per slot to hosts
    uint64 maxSlotLoss; // Max slots that can be lost without data considered to be lost
  }

  struct Content {
    string cid; // content id (if part of a larger set, the chunk cid)
    Erasure erasure; // Erasure coding attributes
    PoR por; // Proof of Retrievability parameters
  }

  struct Erasure {
    uint64 totalChunks; // the total number of chunks in the larger data set
  }

  struct PoR {
    bytes u; // parameters u_1..u_s
    bytes publicKey; // public key
    bytes name; // random name
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
