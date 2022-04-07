// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Collateral.sol";

contract Marketplace is Collateral {
  uint256 public immutable collateral;
  MarketplaceFunds private funds;
  mapping(bytes32 => Request) private requests;
  mapping(bytes32 => RequestState) private requestState;
  mapping(bytes32 => Offer) private offers;

  constructor(IERC20 _token, uint256 _collateral)
    Collateral(_token)
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

    funds.received += request.ask.maxPrice;
    funds.balance += request.ask.maxPrice;
    transferFrom(msg.sender, request.ask.maxPrice);

    emit StorageRequested(id, request.ask);
  }

  function offerStorage(Offer calldata offer) public marketplaceInvariant {
    require(offer.host == msg.sender, "Invalid host address");
    require(balanceOf(msg.sender) >= collateral, "Insufficient collateral");

    Request storage request = requests[offer.requestId];
    require(request.client != address(0), "Unknown request");
    require(request.expiry > block.timestamp, "Request expired");

    require(offer.price <= request.ask.maxPrice, "Price too high");

    bytes32 id = keccak256(abi.encode(offer));
    require(offers[id].host == address(0), "Offer already exists");

    offers[id] = offer;

    _lock(msg.sender, offer.requestId);

    emit StorageOffered(id, offer, offer.requestId);
  }

  function selectOffer(bytes32 id) public marketplaceInvariant {
    Offer storage offer = offers[id];
    require(offer.host != address(0), "Unknown offer");
    require(offer.expiry > block.timestamp, "Offer expired");

    Request storage request = requests[offer.requestId];
    require(request.client == msg.sender, "Only client can select offer");

    RequestState storage state = requestState[offer.requestId];
    require(state.selectedOffer == bytes32(0), "Offer already selected");

    state.selectedOffer = id;

    _createLock(id, offer.expiry);
    _lock(offer.host, id);
    _unlock(offer.requestId);

    uint256 difference = request.ask.maxPrice - offer.price;
    funds.sent += difference;
    funds.balance -= difference;
    token.transfer(request.client, difference);

    emit OfferSelected(id, offer.requestId);
  }

  function _request(bytes32 id) internal view returns (Request storage) {
    return requests[id];
  }

  function _offer(bytes32 id) internal view returns (Offer storage) {
    return offers[id];
  }

  function _selectedOffer(bytes32 requestId) internal view returns (bytes32) {
    return requestState[requestId].selectedOffer;
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
    uint256 maxPrice; // maximum price client will pay (in number of tokens)
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

  struct RequestState {
    bytes32 selectedOffer;
  }

  struct Offer {
    address host;
    bytes32 requestId;
    uint256 price;
    uint256 expiry;
  }

  event StorageRequested(bytes32 requestId, Ask ask);
  event StorageOffered(bytes32 offerId, Offer offer, bytes32 indexed requestId);
  event OfferSelected(bytes32 offerId, bytes32 indexed requestId);

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
