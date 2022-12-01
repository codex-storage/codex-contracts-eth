// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./Collateral.sol";
import "./Proofs.sol";
import "./libs/DAL.sol";

contract Marketplace is Collateral, Proofs {
  using DAL for DAL.Database;
  using EnumerableSetExtensions for EnumerableSetExtensions.ClearableBytes32Set;

  uint256 public immutable collateral;
  MarketplaceFunds private funds;
  mapping(DAL.RequestId => RequestContext) private requestContexts;
  DAL.Database private db;

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

  function myRequests() public view returns (DAL.RequestId[] memory) {
    return DAL.toRequestIds(db.selectClient(msg.sender).activeRequests.values());
  }

  function mySlots() public view returns (DAL.SlotId[] memory) {
    DAL.Host storage host = db.selectHost(msg.sender);
    return db.activeSlotsForHost(host);
  }


  function requestStorage(Request calldata request)
    public
    marketplaceInvariant
  {
    require(request.client == msg.sender, "Invalid client address");

    DAL.RequestId id = _toRequestId(request);
    require(!db.exists(id), "Request already exists");

    // DAL.Request storage dbRequest = DAL.Request(id, request.client, request.ask, request.content, request.expiry, request.nonce);
    if (!db.clientExists(request.client)) {
      db.insertClient(request.client);
    }
    DAL.Request storage dbRequest = db.insertRequest(id,
                     request.client,
                     request.ask,
                     request.content,
                     request.expiry,
                     request.nonce);
    db.insertActiveRequestForClient(id);
    RequestContext storage context = _context(id);
    // set contract end time to `duration` from now (time request was created)
    context.endsAt = block.timestamp + request.ask.duration;
    _setProofEnd(_toEndId(id), context.endsAt);
    _createLock(_toLockId(id), request.expiry);

    uint256 amount = price(dbRequest);
    funds.received += amount;
    funds.balance += amount;
    transferFrom(msg.sender, amount);

    emit StorageRequested(id, request.ask);
  }

  function fillSlot(
    DAL.RequestId requestId,
    uint256 slotIndex,
    bytes calldata proof
  ) public requestMustAcceptProofs(requestId) marketplaceInvariant {
    DAL.Request storage request = db.selectRequest(requestId);
    require(slotIndex < request.ask.slots, "Invalid slot");

    DAL.SlotId slotId = _toSlotId(requestId, slotIndex);
    require(!db.exists(slotId), "Slot already filled");

    require(balanceOf(msg.sender) >= collateral, "Insufficient collateral");
    LockId lockId = _toLockId(requestId);
    _lock(msg.sender, lockId);

    ProofId proofId = _toProofId(slotId);
    _expectProofs(proofId, _toEndId(requestId), request.ask.proofProbability);
    _submitProof(proofId, proof);
    if (!db.hostExists(msg.sender)) {
      db.insertHost(msg.sender);
    }
    db.insertSlot(DAL.Slot(slotId, msg.sender, false, requestId));
    db.insertActiveRequestForHost(msg.sender, requestId);
    db.insertActiveSlotForHost(slotId);

    RequestContext storage context = _context(requestId);
    context.slotsFilled += 1;

    emit SlotFilled(requestId, slotIndex, slotId);
    if (context.slotsFilled == request.ask.slots) {
      context.state = RequestState.Started;
      context.startedAt = block.timestamp;
      _extendLockExpiryTo(lockId, context.endsAt);
      emit RequestFulfilled(requestId);
    }
  }

  function _freeSlot(DAL.SlotId slotId)
    internal
    slotMustAcceptProofs(slotId)
    marketplaceInvariant
    // TODO: restrict senders that can call this function
  {
    DAL.Slot storage slot = db.selectSlot(slotId);
    DAL.RequestId requestId = slot.requestId;
    RequestContext storage context = requestContexts[requestId];

    // TODO: burn host's slot collateral except for repair costs + mark proof
    // missing reward
    // Slot collateral is not yet implemented as the design decision was
    // not finalised.

    _unexpectProofs(_toProofId(slotId));
    db.deleteActiveSlotForHost(slotId);
    address slotHost = slot.host;
    db.deleteSlot(slotId);
    context.slotsFilled -= 1;
    emit SlotFreed(requestId, slotId);

    DAL.Request storage request = db.selectRequest(requestId);
    uint256 slotsLost = request.ask.slots - context.slotsFilled;
    if (
      slotsLost > request.ask.maxSlotLoss &&
      context.state == RequestState.Started
    ) {
      context.state = RequestState.Failed;
      _setProofEnd(_toEndId(requestId), block.timestamp - 1);
      context.endsAt = block.timestamp - 1;
      // TODO: decide if we should *not* delete the slot above. If so, then
      // we'll need to clear the active slots, ie:
      // db.deleteAllActiveHostSlots(slotId);
      db.deleteActiveRequestForClient(requestId);
      db.deleteActiveRequestForHost(slotHost, requestId);
      emit RequestFailed(requestId);

      // TODO: burn all remaining slot collateral (note: slot collateral not
      // yet implemented)
      // TODO: send client remaining funds
    }
  }

  function payoutSlot(DAL.RequestId requestId, uint256 slotIndex)
    public
    marketplaceInvariant
  {
    require(_isFinished(requestId), "Contract not ended");
    RequestContext storage context = _context(requestId);
    DAL.Request storage request = db.selectRequest(requestId);
    DAL.SlotId slotId = _toSlotId(requestId, slotIndex);
    DAL.Slot storage slot = db.selectSlot(slotId);
    require(!slot.hostPaid, "Already paid");

    context.state = RequestState.Finished;
    db.deleteActiveSlotForHost(slotId);
    db.deleteActiveRequestForClient(requestId);
    uint256 amount = pricePerSlot(request);
    funds.sent += amount;
    funds.balance -= amount;
    slot.hostPaid = true;
    require(token.transfer(slot.host, amount), "Payment failed");
  }

  /// @notice Withdraws storage request funds back to the client that deposited them.
  /// @dev Request must be expired, must be in RequestState.New, and the transaction must originate from the depositer address.
  /// @param requestId the id of the request
  function withdrawFunds(DAL.RequestId requestId) public marketplaceInvariant {
    DAL.Request storage request = db.selectRequest(requestId);
    require(block.timestamp > request.expiry, "Request not yet timed out");
    require(request.client == msg.sender, "Invalid client address");
    RequestContext storage context = _context(requestId);
    require(context.state == RequestState.New, "Invalid state");

    // Update request state to Cancelled. Handle in the withdraw transaction
    // as there needs to be someone to pay for the gas to update the state
    context.state = RequestState.Cancelled;
    // TODO: double-check that we don't want to _removeAllHostSlots() here.
    // @markspanbroek?
    db.deleteActiveRequestForClient(requestId);
    // TODO: handle dangling DAL.RequestId in activeHostRequests (for address)
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
  function _isCancelled(DAL.RequestId requestId) internal view returns (bool) {
    RequestContext storage context = _context(requestId);
    return
      context.state == RequestState.Cancelled ||
      (context.state == RequestState.New &&
        block.timestamp > db.selectRequest(requestId).expiry);
  }

  /// @notice Return true if the request state is RequestState.Finished or if the request duration has elapsed and the request was started.
  /// @dev Handles the case when a request may have been finished, but the state has not yet been updated by a transaction.
  /// @param requestId the id of the request
  /// @return true if request is finished
  function _isFinished(DAL.RequestId requestId) internal view returns (bool) {
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
  function _getRequestIdForSlot(DAL.SlotId slotId)
    internal
    view
    returns (DAL.RequestId)
  {
    DAL.Slot memory slot = db.selectSlot(slotId);
    require(!DAL.isDefault(slot.requestId), "Missing request id");
    return slot.requestId;
  }

  /// @notice Return true if the request state the slot belongs to is RequestState.Cancelled or if the request expiry time has elapsed and the request was never started.
  /// @dev Handles the case when a request may have been cancelled, but the client has not withdrawn its funds yet, and therefore the state has not yet been updated.
  /// @param slotId the id of the slot
  /// @return true if request is cancelled
  function _isSlotCancelled(DAL.SlotId slotId) internal view returns (bool) {
    DAL.RequestId requestId = _getRequestIdForSlot(slotId);
    return _isCancelled(requestId);
  }

  function _host(DAL.SlotId slotId) internal view returns (address) {
    return db.selectSlot(slotId).host;
  }

  function _request(DAL.RequestId requestId)
    internal
    view
    returns (DAL.Request storage)
  {
    return db.selectRequest(requestId);
  }

  function _slot(DAL.SlotId slotId) internal view returns (DAL.Slot storage) {
    return db.selectSlot(slotId);
  }

  function _context(DAL.RequestId requestId)
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

  function proofEnd(DAL.SlotId slotId) public view returns (uint256) {
    return requestEnd(db.selectSlot(slotId).requestId);
  }

  function requestEnd(DAL.RequestId requestId) public view returns (uint256) {
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

  function _price(DAL.Request storage request) internal view returns (uint256) {
    return _price(request.ask.slots, request.ask.duration, request.ask.reward);
  }

  function price(DAL.Request storage request) private view returns (uint256) {
    return _price(request.ask.slots, request.ask.duration, request.ask.reward);
  }

  function pricePerSlot(DAL.Request storage request) private view returns (uint256) {
    return request.ask.duration * request.ask.reward;
  }

  function state(DAL.RequestId requestId) public view returns (RequestState) {
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
  function _slotAcceptsProofs(DAL.SlotId slotId) internal view returns (bool) {
    DAL.RequestId requestId = _getRequestIdForSlot(slotId);
    return _requestAcceptsProofs(requestId);
  }

  /// @notice returns true when the request is accepting proof submissions from hosts occupying slots.
  /// @dev Request state must be new or started, and must not be cancelled, finished, or failed.
  /// @param requestId id of the request for which to obtain state info
  function _requestAcceptsProofs(DAL.RequestId requestId)
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
    returns (DAL.RequestId)
  {
    return DAL.RequestId.wrap(keccak256(abi.encode(request)));
  }

  // function _toSlotIds(bytes32[] memory array)
  //   private
  //   pure
  //   returns (DAL.SlotId[] memory result)
  // {
  //   // solhint-disable-next-line no-inline-assembly
  //   assembly {
  //     result := array
  //   }
  // }

  function _toSlotId(DAL.RequestId requestId, uint256 slotIndex)
    internal
    pure
    returns (DAL.SlotId)
  {
    return DAL.SlotId.wrap(keccak256(abi.encode(requestId, slotIndex)));
  }

  function _toLockId(DAL.RequestId requestId) internal pure returns (LockId) {
    return LockId.wrap(DAL.RequestId.unwrap(requestId));
  }

  function _toProofId(DAL.SlotId slotId) internal pure returns (ProofId) {
    return ProofId.wrap(DAL.SlotId.unwrap(slotId));
  }

  function _toEndId(DAL.RequestId requestId) internal pure returns (EndId) {
    return EndId.wrap(DAL.RequestId.unwrap(requestId));
  }

  // function _notEqual(DAL.RequestId a, uint256 b) internal pure returns (bool) {
  //   return DAL.RequestId.unwrap(a) != bytes32(b);
  // }

  // struct Client {
  //   address addr; // PK

  //   EnumerableSetExtensions.ClearableBytes32Set activeRequests;
  // }

  // struct Host {
  //   address addr; // PK

  //   EnumerableSetExtensions.ClearableBytes32Set activeSlots;
  // }

  struct Request {
    address client;
    DAL.Ask ask;
    DAL.Content content;
    uint256 expiry; // time at which this request expires
    bytes32 nonce; // random nonce to differentiate between similar requests
  }

  // struct Slot {
  //   address host;
  //   bool hostPaid;
  //   DAL.RequestId requestId;
  // }

  // struct Ask {
  //   uint64 slots; // the number of requested slots
  //   uint256 slotSize; // amount of storage per slot (in number of bytes)
  //   uint256 duration; // how long content should be stored (in seconds)
  //   uint256 proofProbability; // how often storage proofs are required
  //   uint256 reward; // amount of tokens paid per second per slot to hosts
  //   uint64 maxSlotLoss; // Max slots that can be lost without data considered to be lost
  // }

  // struct Content {
  //   string cid; // content id (if part of a larger set, the chunk cid)
  //   Erasure erasure; // Erasure coding attributes
  //   PoR por; // Proof of Retrievability parameters
  // }

  // struct Erasure {
  //   uint64 totalChunks; // the total number of chunks in the larger data set
  // }

  // struct PoR {
  //   bytes u; // parameters u_1..u_s
  //   bytes publicKey; // public key
  //   bytes name; // random name
  // }

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

  event StorageRequested(DAL.RequestId requestId, DAL.Ask ask);
  event RequestFulfilled(DAL.RequestId indexed requestId);
  event RequestFailed(DAL.RequestId indexed requestId);
  event SlotFilled(
    DAL.RequestId indexed requestId,
    uint256 indexed slotIndex,
    DAL.SlotId slotId
  );
  event SlotFreed(DAL.RequestId indexed requestId, DAL.SlotId slotId);
  event RequestCancelled(DAL.RequestId indexed requestId);

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
  modifier slotMustAcceptProofs(DAL.SlotId slotId) {
    DAL.RequestId requestId = _getRequestIdForSlot(slotId);
    require(_requestAcceptsProofs(requestId), "Slot not accepting proofs");
    _;
  }

  /// @notice Modifier that requires the request state to be that which is accepting proof submissions from hosts occupying slots.
  /// @dev Request state must be new or started, and must not be cancelled, finished, or failed.
  /// @param requestId id of the request, for which to obtain state info
  modifier requestMustAcceptProofs(DAL.RequestId requestId) {
    require(_requestAcceptsProofs(requestId), "Request not accepting proofs");
    _;
  }

  struct MarketplaceFunds {
    uint256 balance;
    uint256 received;
    uint256 sent;
  }
}
