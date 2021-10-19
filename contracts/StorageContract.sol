// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract StorageContract {
  uint public immutable duration; // contract duration in seconds
  uint public immutable size; // storage size in bytes
  bytes32 public immutable contentHash; // hash of data that is to be stored
  uint public immutable price; // price in coins
  address public immutable host; // host that provides storage
  uint public immutable proofPeriod; // average time between proofs (in blocks)
  uint public immutable proofTimeout; // proof has to be submitted before this
  uint public immutable proofMarker; // indicates when a proof is required

  mapping(uint => bool) proofReceived; // whether proof for a block was received
  uint public missingProofs;

  constructor(uint _duration,
              uint _size,
              bytes32 _contentHash,
              uint _price,
              uint _proofPeriod,
              uint _proofTimeout,
              uint _bidExpiry,
              address _host,
              bytes memory requestSignature,
              bytes memory bidSignature)
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
    duration = _duration;
    size = _size;
    price = _price;
    contentHash = _contentHash;
    host = _host;
    proofPeriod = _proofPeriod;
    proofTimeout = _proofTimeout;
    proofMarker = uint(blockhash(block.number - 1)) % _proofPeriod;
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

  // Check whether a proof is required at the time of the block with the
  // specified block number. A proof has to be submitted within the proof
  // timeout for it to be valid. Whether a proof is required is determined
  // randomly, but on average it is once every proof period.
  function isProofRequired(uint blocknumber) public view returns (bool) {
    bytes32 hash = blockhash(blocknumber);
    return hash != 0 && uint(hash) % proofPeriod == proofMarker;
  }

  function isProofTimedOut(uint blocknumber) internal view returns (bool) {
    return block.number >= blocknumber + proofTimeout;
  }

  function submitProof(uint blocknumber, bool proof) public {
    require(proof, "Invalid proof"); // TODO: replace bool by actual proof
    require(isProofRequired(blocknumber), "No proof required for this block");
    require(!isProofTimedOut(blocknumber), "Proof not allowed after timeout");
    require(!proofReceived[blocknumber], "Proof already submitted");
    proofReceived[blocknumber] = true;
  }

  function markProofAsMissing(uint blocknumber) public {
    require(isProofTimedOut(blocknumber), "Proof has not timed out yet");
    require(!proofReceived[blocknumber], "Proof was submitted, not missing");
    require(isProofRequired(blocknumber), "Proof was not required");
    missingProofs += 1;
  }
}
