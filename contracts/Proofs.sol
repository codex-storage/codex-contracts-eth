// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Proofs {

  mapping(bytes32=>bool) private ids;
  mapping(bytes32=>uint) private periods;
  mapping(bytes32=>uint) private timeouts;
  mapping(bytes32=>uint) private markers;
  mapping(bytes32=>uint) private missed;
  mapping(bytes32=>mapping(uint=>bool)) private received;
  mapping(bytes32=>mapping(uint=>bool)) private missing;

  function _period(bytes32 id) internal view returns (uint) {
    return periods[id];
  }

  function _timeout(bytes32 id) internal view returns (uint) {
    return timeouts[id];
  }

  function _missed(bytes32 id) internal view returns (uint) {
    return missed[id];
  }

  // Checks that proof timeout is <= 128. Only the latest 256 blocks can be
  // checked in a smart contract, so that leaves a period of at least 128 blocks
  // after timeout for a validator to signal the absence of a proof.
  function _checkTimeout(uint timeout) private pure {
    require(timeout <= 128, "Invalid proof timeout, needs to be <= 128");
  }

  function _expectProofs(bytes32 id, uint period, uint timeout) internal {
    require(!ids[id], "Proof id already in use");
    _checkTimeout(timeout);
    ids[id] = true;
    periods[id] = period;
    timeouts[id] = timeout;
    markers[id] = uint(blockhash(block.number - 1)) % period;
  }

  // Check whether a proof is required at the time of the block with the
  // specified block number. A proof has to be submitted within the proof
  // timeout for it to be valid. Whether a proof is required is determined
  // randomly, but on average it is once every proof period.
  function _isProofRequired(
    bytes32 id,
    uint blocknumber
  )
    internal view
    returns (bool)
  {
    bytes32 hash = blockhash(blocknumber - 1);
    return hash != 0 && uint(hash) % periods[id] == markers[id];
  }

  function _isProofTimedOut(
    bytes32 id,
    uint blocknumber
  )
    internal view
    returns (bool)
  {
    return block.number >= blocknumber + timeouts[id];
  }

  function _submitProof(
    bytes32 id,
    uint blocknumber,
    bool proof
  )
    internal
  {
    require(proof, "Invalid proof"); // TODO: replace bool by actual proof
    require(
      _isProofRequired(id, blocknumber),
      "No proof required for this block"
    );
    require(
      !_isProofTimedOut(id, blocknumber),
      "Proof not allowed after timeout"
    );
    require(!received[id][blocknumber], "Proof already submitted");
    received[id][blocknumber] = true;
  }

  function _markProofAsMissing(bytes32 id, uint blocknumber) internal {
    require(
      _isProofTimedOut(id, blocknumber),
      "Proof has not timed out yet"
    );
    require(
      !received[id][blocknumber],
      "Proof was submitted, not missing"
    );
    require(
      _isProofRequired(id, blocknumber),
      "Proof was not required"
    );
    require(!missing[id][blocknumber], "Proof already marked as missing");
    missing[id][blocknumber] = true;
    missed[id] += 1;
  }
}
