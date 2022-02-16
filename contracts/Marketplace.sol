// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Marketplace {
  IERC20 public immutable token;
  Totals private totals;
  mapping(bytes32 => Request) private requests;

  constructor(IERC20 _token) invariant {
    token = _token;
  }

  function transferFrom(address sender, uint256 amount) private {
    address receiver = address(this);
    require(token.transferFrom(sender, receiver, amount), "Transfer failed");
  }

  function requestStorage(Request calldata request) public invariant {
    bytes32 id = keccak256(abi.encode(request));
    require(request.size > 0, "Invalid size");
    require(requests[id].size == 0, "Request already exists");
    requests[id] = request;
    transferFrom(msg.sender, request.maxPrice);
    totals.received += request.maxPrice;
    totals.balance += request.maxPrice;
    emit StorageRequested(id, request);
  }

  struct Request {
    uint256 duration;
    uint256 size;
    bytes32 contentHash;
    uint256 proofPeriod;
    uint256 proofTimeout;
    uint256 maxPrice;
    bytes32 nonce;
  }

  event StorageRequested(bytes32 id, Request request);

  modifier invariant() {
    Totals memory oldTotals = totals;
    _;
    assert(totals.received >= oldTotals.received);
    assert(totals.sent >= oldTotals.sent);
    assert(totals.received == totals.balance + totals.sent);
  }

  struct Totals {
    uint256 balance;
    uint256 received;
    uint256 sent;
  }
}
