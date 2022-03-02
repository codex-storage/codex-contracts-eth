// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Proofs {
  uint256 private immutable period;
  uint256 private immutable timeout;

  constructor(uint256 __period, uint256 __timeout) {
    period = __period;
    timeout = __timeout;
  }

  mapping(bytes32 => bool) private ids;
  mapping(bytes32 => uint256) private starts;
  mapping(bytes32 => uint256) private ends;
  mapping(bytes32 => uint256) private markers;
  mapping(bytes32 => uint256) private missed;
  mapping(bytes32 => mapping(uint256 => bool)) private received;
  mapping(bytes32 => mapping(uint256 => bool)) private missing;

  function _period() internal view returns (uint256) {
    return period;
  }

  function _timeout() internal view returns (uint256) {
    return timeout;
  }

  function _end(bytes32 id) internal view returns (uint256) {
    return ends[id];
  }

  function _missed(bytes32 id) internal view returns (uint256) {
    return missed[id];
  }

  function _expectProofs(bytes32 id, uint256 duration) internal {
    require(!ids[id], "Proof id already in use");
    ids[id] = true;
    starts[id] = block.number;
    ends[id] = block.number + duration + 2 * timeout;
    markers[id] = uint256(blockhash(block.number - 1)) % period;
  }

  // Check whether a proof is required at the time of the block with the
  // specified block number. A proof has to be submitted within the proof
  // timeout for it to be valid. Whether a proof is required is determined
  // randomly, but on average it is once every proof period.
  function _isProofRequired(bytes32 id, uint256 blocknumber)
    internal
    view
    returns (bool)
  {
    if (blocknumber < starts[id] || blocknumber >= ends[id]) {
      return false;
    }
    bytes32 hash = blockhash(blocknumber - 1);
    return hash != 0 && uint256(hash) % period == markers[id];
  }

  function _isProofTimedOut(uint256 blocknumber) internal view returns (bool) {
    return block.number >= blocknumber + timeout;
  }

  function _submitProof(
    bytes32 id,
    uint256 blocknumber,
    bool proof
  ) internal {
    require(proof, "Invalid proof"); // TODO: replace bool by actual proof
    require(
      _isProofRequired(id, blocknumber),
      "No proof required for this block"
    );
    require(!_isProofTimedOut(blocknumber), "Proof not allowed after timeout");
    require(!received[id][blocknumber], "Proof already submitted");
    received[id][blocknumber] = true;
  }

  function _markProofAsMissing(bytes32 id, uint256 blocknumber) internal {
    require(_isProofTimedOut(blocknumber), "Proof has not timed out yet");
    require(!received[id][blocknumber], "Proof was submitted, not missing");
    require(_isProofRequired(id, blocknumber), "Proof was not required");
    require(!missing[id][blocknumber], "Proof already marked as missing");
    missing[id][blocknumber] = true;
    missed[id] += 1;
  }
}
