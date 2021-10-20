// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract StorageContracts {

  struct Contract {
    bool initialized; // always true, except for empty contracts in mapping
    uint duration; // contract duration in seconds
    uint size; // storage size in bytes
    bytes32 contentHash; // hash of data that is to be stored
    uint price; // price in coins
    address host; // host that provides storage
    uint proofPeriod; // average time between proofs (in blocks)
    uint proofTimeout; // proof has to be submitted before this
    uint proofMarker; // indicates when a proof is required
    mapping(uint => bool) proofReceived; // whether proof for block was received
    uint missingProofs;
  }

  uint numberOfContracts;
  mapping(uint => Contract) contracts;

  function duration(uint contractId) public view returns (uint) {
    return contracts[contractId].duration;
  }

  function size(uint contractId) public view returns (uint) {
    return contracts[contractId].size;
  }

  function contentHash(uint contractId) public view returns (bytes32) {
    return contracts[contractId].contentHash;
  }

  function price(uint contractId) public view returns (uint) {
    return contracts[contractId].price;
  }

  function host(uint contractId) public view returns (address) {
    return contracts[contractId].host;
  }

  function proofPeriod(uint contractId) public view returns (uint) {
    return contracts[contractId].proofPeriod;
  }

  function proofTimeout(uint contractId) public view returns (uint) {
    return contracts[contractId].proofTimeout;
  }

  function missingProofs(uint contractId) public view returns (uint) {
    return contracts[contractId].missingProofs;
  }

  function newContract(
    uint contractId,
    uint _duration,
    uint _size,
    bytes32 _contentHash,
    uint _price,
    uint _proofPeriod,
    uint _proofTimeout,
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
      _proofTimeout
    );
    bytes32 bidHash = hashBid(requestHash, _bidExpiry, _price);
    checkSignature(requestSignature, requestHash, msg.sender);
    checkSignature(bidSignature, bidHash, _host);
    checkProofTimeout(_proofTimeout);
    checkBidExpiry(_bidExpiry);
    checkId(contractId);
    Contract storage c = contracts[contractId];
    c.initialized = true;
    c.duration = _duration;
    c.size = _size;
    c.price = _price;
    c.contentHash = _contentHash;
    c.host = _host;
    c.proofPeriod = _proofPeriod;
    c.proofTimeout = _proofTimeout;
    c.proofMarker = uint(blockhash(block.number - 1)) % _proofPeriod;
  }

  // Creates hash for a storage request that can be used to check its signature.
  function hashRequest(
    uint _duration,
    uint _size,
    bytes32 _hash,
    uint _proofPeriod,
    uint _proofTimeout
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
      _proofTimeout
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

  // Checks that proof timeout is <= 128. Only the latest 256 blocks can be
  // checked in a smart contract, so that leaves a period of at least 128 blocks
  // after timeout for a validator to signal the absence of a proof.
  function checkProofTimeout(uint timeout) internal pure {
    require(timeout <= 128, "Invalid proof timeout, needs to be <= 128");
  }

  function checkBidExpiry(uint expiry) internal view {
    require(expiry > block.timestamp, "Bid expired");
  }

  function checkId(uint contractId) internal view {
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
    uint contractId,
    uint blocknumber
  )
    public view
    returns (bool)
  {
    Contract storage c = contracts[contractId];
    bytes32 hash = blockhash(blocknumber);
    return hash != 0 && uint(hash) % c.proofPeriod == c.proofMarker;
  }

  function isProofTimedOut(
    uint contractId,
    uint blocknumber
  )
    internal view
    returns (bool)
  {
    Contract storage c = contracts[contractId];
    return block.number >= blocknumber + c.proofTimeout;
  }

  function submitProof(
    uint contractId,
    uint blocknumber,
    bool proof
  )
    public
  {
    Contract storage c = contracts[contractId];
    require(proof, "Invalid proof"); // TODO: replace bool by actual proof
    require(
      isProofRequired(contractId, blocknumber),
      "No proof required for this block"
    );
    require(
      !isProofTimedOut(contractId, blocknumber),
      "Proof not allowed after timeout"
    );
    require(!c.proofReceived[blocknumber], "Proof already submitted");
    c.proofReceived[blocknumber] = true;
  }

  function markProofAsMissing(uint contractId, uint blocknumber) public {
    Contract storage c = contracts[contractId];
    require(
      isProofTimedOut(contractId, blocknumber),
      "Proof has not timed out yet"
    );
    require(
      !c.proofReceived[blocknumber],
      "Proof was submitted, not missing"
    );
    require(
      isProofRequired(contractId, blocknumber),
      "Proof was not required"
    );
    c.missingProofs += 1;
  }
}
