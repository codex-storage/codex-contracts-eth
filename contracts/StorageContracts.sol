// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./Proofs.sol";

contract StorageContracts is Proofs {

  struct Contract {
    bool initialized; // always true, except for empty contracts in mapping
    uint duration; // contract duration in seconds
    uint size; // storage size in bytes
    bytes32 contentHash; // hash of data that is to be stored
    uint price; // price in coins
    address host; // host that provides storage
  }

  uint numberOfContracts;
  mapping(bytes32 => Contract) contracts;

  function duration(bytes32 contractId) public view returns (uint) {
    return contracts[contractId].duration;
  }

  function size(bytes32 contractId) public view returns (uint) {
    return contracts[contractId].size;
  }

  function contentHash(bytes32 contractId) public view returns (bytes32) {
    return contracts[contractId].contentHash;
  }

  function price(bytes32 contractId) public view returns (uint) {
    return contracts[contractId].price;
  }

  function host(bytes32 contractId) public view returns (address) {
    return contracts[contractId].host;
  }

  function proofPeriod(bytes32 contractId) public view returns (uint) {
    return _period(contractId);
  }

  function proofTimeout(bytes32 contractId) public view returns (uint) {
    return _timeout(contractId);
  }

  function missingProofs(bytes32 contractId) public view returns (uint) {
    return _missed(contractId);
  }

  function newContract(
    uint _duration,
    uint _size,
    bytes32 _contentHash,
    uint _price,
    uint _proofPeriod,
    uint _proofTimeout,
    bytes32 _nonce,
    uint _bidExpiry,
    address _host,
    bytes memory requestSignature,
    bytes memory bidSignature
  )
    public
  {
    bytes32 requestHash = hashRequest(
      _duration,
      _size,
      _contentHash,
      _proofPeriod,
      _proofTimeout,
      _nonce
    );
    bytes32 bidHash = hashBid(requestHash, _bidExpiry, _price);
    checkSignature(requestSignature, requestHash, msg.sender);
    checkSignature(bidSignature, bidHash, _host);
    checkBidExpiry(_bidExpiry);
    bytes32 contractId = bidHash;
    checkId(contractId);
    Contract storage c = contracts[contractId];
    c.initialized = true;
    c.duration = _duration;
    c.size = _size;
    c.price = _price;
    c.contentHash = _contentHash;
    c.host = _host;
    _expectProofs(contractId, _proofPeriod, _proofTimeout);
  }

  // Creates hash for a storage request that can be used to check its signature.
  function hashRequest(
    uint _duration,
    uint _size,
    bytes32 _hash,
    uint _proofPeriod,
    uint _proofTimeout,
    bytes32 _nonce
  )
    internal pure
    returns (bytes32)
  {
    return keccak256(abi.encodePacked(
      "[dagger.request.v1]",
      _duration,
      _size,
      _hash,
      _proofPeriod,
      _proofTimeout,
      _nonce
    ));
  }

  // Creates hash for a storage bid that can be used to check its signature.
  function hashBid(bytes32 requestHash, uint _expiry, uint _price)
    internal pure
    returns (bytes32)
  {
    return keccak256(abi.encodePacked(
      "[dagger.bid.v1]",
      requestHash,
      _expiry,
      _price
    ));
  }

  // Checks a signature for a storage request or bid, given its hash.
  function checkSignature(bytes memory signature, bytes32 hash, address signer)
    internal pure
  {
    bytes32 messageHash = ECDSA.toEthSignedMessageHash(hash);
    address recovered = ECDSA.recover(messageHash, signature);
    require(recovered == signer, "Invalid signature");
  }

  function checkBidExpiry(uint expiry) internal view {
    require(expiry > block.timestamp, "Bid expired");
  }

  function checkId(bytes32 contractId) internal view {
    require(
      !contracts[contractId].initialized,
      "A contract with this id already exists"
    );
  }

  // Check whether a proof is required at the time of the block with the
  // specified block number. A proof has to be submitted within the proof
  // timeout for it to be valid. Whether a proof is required is determined
  // randomly, but on average it is once every proof period.
  function isProofRequired(
    bytes32 contractId,
    uint blocknumber
  )
    public view
    returns (bool)
  {
    return _isProofRequired(contractId, blocknumber);
  }

  function isProofTimedOut(
    bytes32 contractId,
    uint blocknumber
  )
    public view
    returns (bool)
  {
    return _isProofTimedOut(contractId, blocknumber);
  }

  function submitProof(
    bytes32 contractId,
    uint blocknumber,
    bool proof
  )
    public
  {
    _submitProof(contractId, blocknumber, proof);
  }

  function markProofAsMissing(bytes32 contractId, uint blocknumber) public {
    _markProofAsMissing(contractId, blocknumber);
  }
}
