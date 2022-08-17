// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Collateral.sol";
import "./Proofs.sol";

contract Marketplace is Collateral, Proofs {
  uint256 public immutable collateral;
  MarketplaceFunds private funds;
  mapping(bytes32 => Request) private requests;
  mapping(bytes32 => RequestState) private requestState;
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

    bytes32 slotId = keccak256(abi.encode(requestId, slotIndex));
    Slot storage slot = slots[slotId];
    require(slot.host == address(0), "Slot already filled");

    require(balanceOf(msg.sender) >= collateral, "Insufficient collateral");
    _lock(msg.sender, requestId);

    _expectProofs(slotId, request.ask.proofProbability, request.ask.duration);
    _submitProof(slotId, proof);

    RequestState storage state = requestState[requestId];
    slot.host = msg.sender;
    state.slotsFilled += 1;
    emit SlotFilled(requestId, slotIndex, slotId);
    if (state.slotsFilled == request.ask.slots) {
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

  function _host(bytes32 slotId) internal view returns (address) {
    return slots[slotId].host;
  }

  function _request(bytes32 id) internal view returns (Request storage) {
    return requests[id];
  }

  function proofPeriod() public view returns (uint256) {
    return _period();
  }

  function proofTimeout() public view returns (uint256) {
    return _timeout();
  }

  function proofEnd(bytes32 slotId) public view returns (uint256) {
    return _end(slotId);
  }

  function price(Request calldata request) private pure returns (uint256) {
    return request.ask.slots * request.ask.duration * request.ask.reward;
  }

  function pricePerSlot(Request memory request) private pure returns (uint256) {
    return request.ask.duration * request.ask.reward;
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

  struct RequestState {
    uint256 slotsFilled;
  }

  struct Slot {
    address host;
    bool hostPaid;
  }

  event StorageRequested(bytes32 requestId, Ask ask);
  event RequestFulfilled(bytes32 indexed requestId);
  event SlotFilled(
    bytes32 indexed requestId,
    uint256 indexed slotIndex,
    bytes32 indexed slotId
  );

  modifier marketplaceInvariant() {
    MarketplaceFunds memory oldFunds = funds;
    _;
    assert(funds.received >= oldFunds.received);
    assert(funds.sent >= oldFunds.sent);
    assert(funds.received == funds.balance + funds.sent);
  }

  struct MarketplaceFunds {
    uint256 balance;
    uint256 received;
    uint256 sent;
  }
}
