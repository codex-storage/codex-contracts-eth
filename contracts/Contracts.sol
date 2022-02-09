// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract Contracts {
  mapping(bytes32 => bool) private ids; // contract id, equal to hash of bid
  mapping(bytes32 => uint256) private durations; // contract duration in blocks
  mapping(bytes32 => uint256) private sizes; // storage size in bytes
  mapping(bytes32 => bytes32) private contentHashes; // hash of data to be stored
  mapping(bytes32 => uint256) private proofPeriods; // period between proofs
  mapping(bytes32 => uint256) private proofTimeouts; // timeout for proof submission
  mapping(bytes32 => uint256) private prices; // price in coins
  mapping(bytes32 => address) private hosts; // host that provides storage

  function _duration(bytes32 id) internal view returns (uint256) {
    return durations[id];
  }

  function _size(bytes32 id) internal view returns (uint256) {
    return sizes[id];
  }

  function _contentHash(bytes32 id) internal view returns (bytes32) {
    return contentHashes[id];
  }

  function _proofPeriod(bytes32 id) internal view returns (uint256) {
    return proofPeriods[id];
  }

  function _proofTimeout(bytes32 id) internal view returns (uint256) {
    return proofTimeouts[id];
  }

  function _price(bytes32 id) internal view returns (uint256) {
    return prices[id];
  }

  function _host(bytes32 id) internal view returns (address) {
    return hosts[id];
  }

  function _newContract(
    uint256 duration,
    uint256 size,
    bytes32 contentHash,
    uint256 proofPeriod,
    uint256 proofTimeout,
    bytes32 nonce,
    uint256 price,
    address host,
    uint256 bidExpiry,
    bytes memory requestSignature,
    bytes memory bidSignature
  ) internal returns (bytes32 id) {
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
    proofPeriods[id] = proofPeriod;
    proofTimeouts[id] = proofTimeout;
    prices[id] = price;
    hosts[id] = host;
  }

  // Creates hash for a storage request that can be used to check its signature.
  function _hashRequest(
    uint256 duration,
    uint256 size,
    bytes32 hash,
    uint256 proofPeriod,
    uint256 proofTimeout,
    bytes32 nonce
  ) private pure returns (bytes32) {
    return
      keccak256(
        abi.encode(
          "[dagger.request.v1]",
          duration,
          size,
          hash,
          proofPeriod,
          proofTimeout,
          nonce
        )
      );
  }

  // Creates hash for a storage bid that can be used to check its signature.
  function _hashBid(
    bytes32 requestHash,
    uint256 expiry,
    uint256 price
  ) private pure returns (bytes32) {
    return keccak256(abi.encode("[dagger.bid.v1]", requestHash, expiry, price));
  }

  // Checks a signature for a storage request or bid, given its hash.
  function _checkSignature(
    bytes memory signature,
    bytes32 hash,
    address signer
  ) private pure {
    bytes32 messageHash = ECDSA.toEthSignedMessageHash(hash);
    address recovered = ECDSA.recover(messageHash, signature);
    require(recovered == signer, "Invalid signature");
  }

  function _checkBidExpiry(uint256 expiry) private view {
    // solhint-disable-next-line not-rely-on-time
    require(expiry > block.timestamp, "Bid expired");
  }

  function _checkId(bytes32 id) private view {
    require(!ids[id], "Contract already exists");
  }
}
