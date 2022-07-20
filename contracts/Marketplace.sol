// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Collateral.sol";
import "./Proofs.sol";

contract Marketplace is Collateral, Proofs {
  uint256 public immutable collateral;
  MarketplaceFunds private funds;
  mapping(bytes32 => Request) private requests;
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

    funds.received += request.ask.reward;
    funds.balance += request.ask.reward;
    transferFrom(msg.sender, request.ask.reward);

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
    require(slotIndex < request.content.erasure.totalNodes, "Invalid slot");

    bytes32 slotId = keccak256(abi.encode(requestId, slotIndex));
    Slot storage slot = slots[slotId];
    require(slot.host == address(0), "Slot already filled");

    require(balanceOf(msg.sender) >= collateral, "Insufficient collateral");
    _lock(msg.sender, requestId);

    _expectProofs(slotId, request.ask.proofProbability, request.ask.duration);
    _submitProof(slotId, proof);

    slot.host = msg.sender;
    emit SlotFilled(requestId, slotIndex, slotId);
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
    uint256 amount = requests[requestId].ask.reward;
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

  function proofEnd(bytes32 contractId) public view returns (uint256) {
    return _end(contractId);
  }

  struct Request {
    address client;
    Ask ask;
    Content content;
    uint256 expiry; // time at which this request expires
    bytes32 nonce; // random nonce to differentiate between similar requests
  }

  struct Ask {
    uint256 size; // size of requested storage in number of bytes
    uint256 duration; // how long content should be stored (in seconds)
    uint256 proofProbability; // how often storage proofs are required
    uint256 reward; // reward that the client will pay (in number of tokens)
  }

  struct Content {
    string cid; // content id (if part of a larger set, the chunk cid)
    Erasure erasure; // Erasure coding attributes
    PoR por; // Proof of Retrievability parameters
  }

  struct Erasure {
    uint64 totalChunks; // the total number of chunks in the larger data set
    uint64 totalNodes; // the total number of nodes that store the data set
    uint64 nodeId; // index of this node in the list of total nodes
  }

  struct PoR {
    bytes u; // parameters u_1..u_s
    bytes publicKey; // public key
    bytes name; // random name
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
