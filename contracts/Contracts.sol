// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract Contracts {

  mapping(bytes32=>bool) private ids; // contract id, equal to hash of bid
  mapping(bytes32=>uint) private durations; // contract duration in blocks
  mapping(bytes32=>uint) private sizes; // storage size in bytes
  mapping(bytes32=>bytes32) private contentHashes; // hash of data to be stored
  mapping(bytes32=>uint) private prices; // price in coins
  mapping(bytes32=>address) private hosts; // host that provides storage

  function _duration(bytes32 id) internal view returns (uint) {
    return durations[id];
  }

  function _size(bytes32 id) internal view returns (uint) {
    return sizes[id];
  }

  function _contentHash(bytes32 id) internal view returns (bytes32) {
    return contentHashes[id];
  }

  function _price(bytes32 id) internal view returns (uint) {
    return prices[id];
  }

  function _host(bytes32 id) internal view returns (address) {
    return hosts[id];
  }

  function _newContract(
    uint duration,
    uint size,
    bytes32 contentHash,
    uint proofPeriod,
    uint proofTimeout,
    bytes32 nonce,
    uint price,
    address host,
    uint bidExpiry,
    bytes memory requestSignature,
    bytes memory bidSignature
  )
    internal
    returns (bytes32 id)
  {
    bytes32 requestHash = _hashRequest(
      duration,
      size,
      contentHash,
      proofPeriod,
      proofTimeout,
      nonce
    );
    bytes32 bidHash = _hashBid(requestHash, bidExpiry, price);
    _checkSignature(requestSignature, requestHash, msg.sender);
    _checkSignature(bidSignature, bidHash, host);
    _checkBidExpiry(bidExpiry);
    _checkId(bidHash);
    id = bidHash;
    ids[id] = true;
    durations[id] = duration;
    sizes[id] = size;
    contentHashes[id] = contentHash;
    prices[id] = price;
    hosts[id] = host;
  }

  // Creates hash for a storage request that can be used to check its signature.
  function _hashRequest(
    uint duration,
    uint size,
    bytes32 hash,
    uint proofPeriod,
    uint proofTimeout,
    bytes32 nonce
  )
    private pure
    returns (bytes32)
  {
    return keccak256(abi.encodePacked(
      "[dagger.request.v1]",
      duration,
      size,
      hash,
      proofPeriod,
      proofTimeout,
      nonce
    ));
  }

  // Creates hash for a storage bid that can be used to check its signature.
  function _hashBid(bytes32 requestHash, uint expiry, uint price)
    private pure
    returns (bytes32)
  {
    return keccak256(abi.encodePacked(
      "[dagger.bid.v1]",
      requestHash,
      expiry,
      price
    ));
  }

  // Checks a signature for a storage request or bid, given its hash.
  function _checkSignature(bytes memory signature, bytes32 hash, address signer)
    private pure
  {
    bytes32 messageHash = ECDSA.toEthSignedMessageHash(hash);
    address recovered = ECDSA.recover(messageHash, signature);
    require(recovered == signer, "Invalid signature");
  }

  function _checkBidExpiry(uint expiry) private view {
    require(expiry > block.timestamp, "Bid expired");
  }

  function _checkId(bytes32 id) private view {
    require(
      !ids[id],
      "A contract with this id already exists"
    );
  }
}
