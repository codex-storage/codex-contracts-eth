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

    funds.received += request.maxPrice;
    funds.balance += request.maxPrice;
    transferFrom(msg.sender, request.maxPrice);

    emit StorageRequested(id, request);
  }

  function offerStorage(Offer calldata offer) public marketplaceInvariant {
    require(offer.host == msg.sender, "Invalid host address");
    require(balanceOf(msg.sender) >= collateral, "Insufficient collateral");

    Request storage request = requests[offer.requestId];
    require(request.client != address(0), "Unknown request");
    // solhint-disable-next-line not-rely-on-time
    require(request.expiry > block.timestamp, "Request expired");

    require(offer.price <= request.maxPrice, "Price too high");

    bytes32 id = keccak256(abi.encode(offer));
    require(offers[id].host == address(0), "Offer already exists");

    offers[id] = offer;

    _lock(msg.sender, offer.requestId);

    emit StorageOffered(id, offer);
  }

  function selectOffer(bytes32 id) public marketplaceInvariant {
    Offer storage offer = offers[id];
    require(offer.host != address(0), "Unknown offer");
    // solhint-disable-next-line not-rely-on-time
    require(offer.expiry > block.timestamp, "Offer expired");

    Request storage request = requests[offer.requestId];
    require(request.client == msg.sender, "Only client can select offer");

    RequestState storage state = requestState[offer.requestId];
    require(!state.offerSelected, "Offer already selected");

    state.offerSelected = true;

    _createLock(id, offer.expiry);
    _lock(offer.host, id);
    _unlock(offer.requestId);

    uint256 difference = request.maxPrice - offer.price;
    funds.sent += difference;
    funds.balance -= difference;
    token.transfer(request.client, difference);
  }

  struct Request {
    address client;
    uint256 duration;
    uint256 size;
    bytes32 contentHash;
    uint256 proofPeriod;
    uint256 proofTimeout;
    uint256 maxPrice;
    uint256 expiry;
    bytes32 nonce;
  }

  struct RequestState {
    bool offerSelected;
  }

  struct Offer {
    address host;
    bytes32 requestId;
    uint256 price;
    uint256 expiry;
  }

  event StorageRequested(bytes32 id, Request request);
  event StorageOffered(bytes32 id, Offer offer);

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
