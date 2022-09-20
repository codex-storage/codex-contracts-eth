// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Collateral.sol";
import "./Proofs.sol";

contract Marketplace is Collateral, Proofs {
  uint256 public immutable collateral;
  MarketplaceFunds private funds;
  mapping(bytes32 => Request) private requests;
  mapping(bytes32 => RequestContext) private requestContexts;
  mapping(bytes32 => Slot) private slots;

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

  function requestStorage(Request calldata request)
    public
    marketplaceInvariant
  {
    require(request.client == msg.sender, "Invalid client address");

    bytes32 id = keccak256(abi.encode(request));
    require(requests[id].client == address(0), "Request already exists");

    requests[id] = request;

    _createLock(id, request.expiry);

    uint256 amount = price(request);
    funds.received += amount;
    funds.balance += amount;
    transferFrom(msg.sender, amount);

    emit StorageRequested(id, request.ask);
  }

  function fillSlot(
    bytes32 requestId,
    uint256 slotIndex,
    bytes calldata proof
  ) public marketplaceInvariant {
    Request storage request = requests[requestId];
    require(request.client != address(0), "Unknown request");
    require(request.expiry > block.timestamp, "Request expired");
    require(slotIndex < request.ask.slots, "Invalid slot");
    RequestContext storage context = requestContexts[requestId];
    // TODO: in the case of repair, update below require condition by adding
    // || context.state == RequestState.Started
    require(context.state == RequestState.New, "Invalid state");

    bytes32 slotId = keccak256(abi.encode(requestId, slotIndex));
    Slot storage slot = slots[slotId];
    require(slot.host == address(0), "Slot already filled");

    require(balanceOf(msg.sender) >= collateral, "Insufficient collateral");
    _lock(msg.sender, requestId);

    _expectProofs(slotId, request.ask.proofProbability, request.ask.duration);
    _submitProof(slotId, proof);

    slot.host = msg.sender;
    slot.requestId = requestId;
    context.slotsFilled += 1;
    emit SlotFilled(requestId, slotIndex, slotId);
    if (context.slotsFilled == request.ask.slots) {
      context.state = RequestState.Started;
      _extendLockExpiry(requestId, block.timestamp + request.ask.duration);
      emit RequestFulfilled(requestId);
    }
  }

  function payoutSlot(bytes32 requestId, uint256 slotIndex)
    public
    marketplaceInvariant
  {
    bytes32 slotId = keccak256(abi.encode(requestId, slotIndex));
    require(block.timestamp > proofEnd(slotId), "Contract not ended");
    Slot storage slot = slots[slotId];
    require(slot.host != address(0), "Slot empty");
    require(!slot.hostPaid, "Already paid");
    uint256 amount = pricePerSlot(requests[requestId]);
    funds.sent += amount;
    funds.balance -= amount;
    slot.hostPaid = true;
    require(token.transfer(slot.host, amount), "Payment failed");
  }

  /// @notice Withdraws storage request funds back to the client that deposited them.
  /// @dev Request must be expired, must be in RequestState.New, and the transaction must originate from the depositer address.
  /// @param requestId the id of the request
  function withdrawFunds(bytes32 requestId) public marketplaceInvariant {
    Request storage request = requests[requestId];
    require(block.timestamp > request.expiry, "Request not yet timed out");
    require(request.client == msg.sender, "Invalid client address");
    RequestContext storage context = requestContexts[requestId];
    require(context.state == RequestState.New, "Invalid state");

    // Update request state to Cancelled. Handle in the withdraw transaction
    // as there needs to be someone to pay for the gas to update the state
    context.state = RequestState.Cancelled;
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
  function _isCancelled(bytes32 requestId) internal view returns (bool) {
    RequestContext memory context = requestContexts[requestId];
    return
      context.state == RequestState.Cancelled ||
      (
        context.state == RequestState.New &&
        block.timestamp > requests[requestId].expiry
      );
  }

  /// @notice Return id of request that slot belongs to
  /// @dev Returns requestId that is mapped to the slotId
  /// @param slotId id of the slot
  /// @return if of the request the slot belongs to
  function _getRequestIdForSlot(bytes32 slotId) internal view returns (bytes32) {
    Slot memory slot = _slot(slotId);
    require(slot.requestId != 0, "Missing request id");
    return slot.requestId;
  }

  /// @notice Return true if the request state the slot belongs to is RequestState.Cancelled or if the request expiry time has elapsed and the request was never started.
  /// @dev Handles the case when a request may have been cancelled, but the client has not withdrawn its funds yet, and therefore the state has not yet been updated.
  /// @param slotId the id of the slot
  /// @return true if request is cancelled
  function _isSlotCancelled(bytes32 slotId) internal view returns (bool) {
    bytes32 requestId = _getRequestIdForSlot(slotId);
    return _isCancelled(requestId);
  }

  function _host(bytes32 slotId) internal view returns (address) {
    return slots[slotId].host;
  }

  function _request(bytes32 id) internal view returns (Request storage) {
    return requests[id];
  }

  function _slot(bytes32 slotId) internal view returns (Slot memory) {
    Slot memory slot = slots[slotId];
    require(slot.host != address(0), "Slot empty");
    return slot;
  }

  function _context(bytes32 requestId) internal view returns (RequestContext storage) {
    return requestContexts[requestId];
  }

  function proofPeriod() public view returns (uint256) {
    return _period();
  }

  function proofTimeout() public view returns (uint256) {
    return _timeout();
  }

  function proofEnd(bytes32 slotId) public view returns (uint256) {
    uint256 end = _end(slotId);
    if (!_slotAcceptsProofs(slotId)) {
      return end < block.timestamp ? end : block.timestamp - 1;
    }
    return end;
  }

  function _price(
    uint64 numSlots,
    uint256 duration,
    uint256 reward) internal pure returns (uint256) {

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

  function state(bytes32 requestId) public view returns (RequestState) {
    // TODO: add check for _isFinished
    if (_isCancelled(requestId)) {
      return RequestState.Cancelled;
    } else {
      RequestContext storage context = _context(requestId);
      return context.state;
    }
  }


  /// @notice returns true when the request is accepting proof submissions from hosts occupying slots.
  /// @dev Request state must be new or started, and must not be cancelled, finished, or failed.
  /// @param requestId id of the request for which to obtain state info
  function _requestAcceptsProofs(bytes32 requestId) internal view returns (bool) {
    RequestState s = state(requestId);
    return s == RequestState.New || s == RequestState.Started;
  }

  /// @notice returns true when the request is accepting proof submissions from hosts occupying slots.
  /// @dev Request state must be new or started, and must not be cancelled, finished, or failed.
  /// @param slotId id of the slot, that is mapped to a request, for which to obtain state info
  function _slotAcceptsProofs(bytes32 slotId) internal view returns (bool) {
    bytes32 requestId = _getRequestIdForSlot(slotId);
    return _requestAcceptsProofs(requestId);
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
    New,        // [default] waiting to fill slots
    Started,    // all slots filled, accepting regular proofs
    Cancelled,  // not enough slots filled before expiry
    Finished,   // successfully completed
    Failed      // too many nodes have failed to provide proofs, data lost
  }

  struct RequestContext {
    uint256 slotsFilled;
    RequestState state;
  }

  struct Slot {
    address host;
    bool hostPaid;
    bytes32 requestId;
  }

  event StorageRequested(bytes32 requestId, Ask ask);
  event RequestFulfilled(bytes32 indexed requestId);
  event SlotFilled(
    bytes32 indexed requestId,
    uint256 indexed slotIndex,
    bytes32 indexed slotId
  );
  event RequestCancelled(bytes32 indexed requestId);

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
  modifier slotMustAcceptProofs(bytes32 slotId) {
    bytes32 requestId = _getRequestIdForSlot(slotId);
    require(_requestAcceptsProofs(requestId), "Slot not accepting proofs");
    _;
  }

  struct MarketplaceFunds {
    uint256 balance;
    uint256 received;
    uint256 sent;
  }
}
