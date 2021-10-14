// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract StorageContract {
  uint public immutable duration; // contract duration in seconds
  uint public immutable size; // storage size in bytes
  uint public immutable price; // price in coins
  address public immutable host; // host that provides storage
  uint public immutable proofPeriod; // average time between proofs (in blocks)
  uint public immutable proofTimeout; // proof has to be submitted before this

  constructor(uint _duration,
              uint _size,
              uint _price,
              uint _proofPeriod,
              uint _proofTimeout,
              address _host,
              bytes memory requestSignature,
              bytes memory bidSignature)
  {
    bytes32 requestHash = hashRequest(_duration, _size);
    bytes32 bidHash = hashBid(requestHash, _price);
    checkSignature(requestSignature, requestHash, msg.sender);
    checkSignature(bidSignature, bidHash, _host);
    duration = _duration;
    size = _size;
    price = _price;
    host = _host;
    proofPeriod = _proofPeriod;
    proofTimeout = _proofTimeout;
  }

  // creates hash for a storage request that can be used to check its signature
  function hashRequest(uint _duration, uint _size)
    internal pure
    returns (bytes32)
  {
    return keccak256(abi.encodePacked(
      "[dagger.request.v1]",
      _duration,
      _size
    ));
  }

  // creates hash for a storage bid that can be used to check its signature
  function hashBid(bytes32 requestHash, uint _price)
    internal pure
    returns (bytes32)
  {
    return keccak256(abi.encodePacked(
      "[dagger.bid.v1]",
      requestHash,
      _price
    ));
  }

  // checks a signature for a storage request or bid, given its hash
  function checkSignature(bytes memory signature, bytes32 hash, address signer)
    internal pure
  {
    bytes32 messageHash = ECDSA.toEthSignedMessageHash(hash);
    address recovered = ECDSA.recover(messageHash, signature);
    require(recovered == signer, "Invalid signature");
  }

}
