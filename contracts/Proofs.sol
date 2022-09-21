// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Proofs {
  uint256 private immutable period;
  uint256 private immutable timeout;
  uint8 private immutable downtime;

  constructor(
    uint256 __period,
    uint256 __timeout,
    uint8 __downtime
  ) {
    require(block.number > 256, "Insufficient block height");
    period = __period;
    timeout = __timeout;
    downtime = __downtime;
  }

  mapping(bytes32 => bool) private ids;
  mapping(bytes32 => uint256) private starts;
  mapping(bytes32 => uint256) private ends;
  mapping(bytes32 => uint256) private probabilities;
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

  function periodOf(uint256 timestamp) private view returns (uint256) {
    return timestamp / period;
  }

  function currentPeriod() private view returns (uint256) {
    return periodOf(block.timestamp);
  }

  function _expectProofs(
    bytes32 id,
    uint256 probability,
    uint256 duration
  ) internal {
    require(!ids[id], "Proof id already in use");
    ids[id] = true;
    starts[id] = block.timestamp;
    ends[id] = block.timestamp + duration;
    probabilities[id] = probability;
    markers[id] = uint256(blockhash(block.number - 1)) % period;
  }

  function _unexpectProofs(
    bytes32 id
  ) internal {
    require(ids[id], "Proof id not in use");
    ids[id] = false;
  }

  function _getPointer(bytes32 id, uint256 proofPeriod)
    internal
    view
    returns (uint8)
  {
    uint256 blockNumber = block.number % 256;
    uint256 periodNumber = proofPeriod % 256;
    uint256 idOffset = uint256(id) % 256;
    uint256 pointer = (blockNumber + periodNumber + idOffset) % 256;
    return uint8(pointer);
  }

  function _getPointer(bytes32 id) internal view returns (uint8) {
    return _getPointer(id, currentPeriod());
  }

  function _getChallenge(uint8 pointer) internal view returns (bytes32) {
    bytes32 hash = blockhash(block.number - 1 - pointer);
    assert(uint256(hash) != 0);
    return keccak256(abi.encode(hash));
  }

  function _getChallenge(bytes32 id, uint256 proofPeriod)
    internal
    view
    returns (bytes32)
  {
    return _getChallenge(_getPointer(id, proofPeriod));
  }

  function _getChallenge(bytes32 id) internal view returns (bytes32) {
    return _getChallenge(id, currentPeriod());
  }

  function _getProofRequirement(bytes32 id, uint256 proofPeriod)
    internal
    view
    returns (bool isRequired, uint8 pointer)
  {
    if (proofPeriod <= periodOf(starts[id])) {
      return (false, 0);
    }
    if (proofPeriod >= periodOf(ends[id])) {
      return (false, 0);
    }
    pointer = _getPointer(id, proofPeriod);
    bytes32 challenge = _getChallenge(pointer);
    uint256 probability = (probabilities[id] * (256 - downtime)) / 256;
    // TODO: add test for below change
    isRequired = ids[id] && uint256(challenge) % probability == 0;
  }

  function _isProofRequired(bytes32 id, uint256 proofPeriod)
    internal
    view
    returns (bool)
  {
    bool isRequired;
    uint8 pointer;
    (isRequired, pointer) = _getProofRequirement(id, proofPeriod);
    return isRequired && pointer >= downtime;
  }

  function _isProofRequired(bytes32 id) internal view returns (bool) {
    return _isProofRequired(id, currentPeriod());
  }

  function _willProofBeRequired(bytes32 id) internal view returns (bool) {
    bool isRequired;
    uint8 pointer;
    (isRequired, pointer) = _getProofRequirement(id, currentPeriod());
    return isRequired && pointer < downtime;
  }

  function _submitProof(bytes32 id, bytes calldata proof) internal {
    require(proof.length > 0, "Invalid proof"); // TODO: replace by actual check
    require(!received[id][currentPeriod()], "Proof already submitted");
    received[id][currentPeriod()] = true;
    emit ProofSubmitted(id, proof);
  }

  function _markProofAsMissing(bytes32 id, uint256 missedPeriod) internal {
    uint256 periodEnd = (missedPeriod + 1) * period;
    require(periodEnd < block.timestamp, "Period has not ended yet");
    require(block.timestamp < periodEnd + timeout, "Validation timed out");
    require(!received[id][missedPeriod], "Proof was submitted, not missing");
    require(_isProofRequired(id, missedPeriod), "Proof was not required");
    require(!missing[id][missedPeriod], "Proof already marked as missing");
    missing[id][missedPeriod] = true;
    missed[id] += 1;
  }

  event ProofSubmitted(bytes32 id, bytes proof);
}
