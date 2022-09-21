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
  mapping(bytes32 => bytes32) private idEnds;
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

  function _end(bytes32 endId) internal view returns (uint256) {
    uint256 end = ends[endId];
    require(end > 0, "Proof ending doesn't exist");
    return ends[endId];
  }

  function _endId(bytes32 id) internal view returns (bytes32) {
    bytes32 endId = idEnds[id];
    require(endId > 0, "endId for given id doesn't exist");
    return endId;
  }

  function _endFromId(bytes32 id) internal view returns (uint256) {
    bytes32 endId = _endId(id);
    return _end(endId);
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

  /// @notice Informs the contract that proofs should be expected for id
  /// @dev Requires that the id is not already in use
  /// @param id identifies the proof expectation, typically a slot id
  /// @param endId Identifies the id of the proof expectation ending. Typically a request id. Different from id because the proof ending is shared amongst many ids.
  /// @param probability The probability that a proof should be expected
  /// @param duration Duration, from now, for which proofs should be expected
  function _expectProofs(
    bytes32 id, // typically slot id
    bytes32 endId, // typically request id, used so that the ending is global for all slots
    uint256 probability,
    uint256 duration
  ) internal {
    require(!ids[id], "Proof id already in use");
    ids[id] = true;
    starts[id] = block.timestamp;
    ends[endId] = block.timestamp + duration;
    probabilities[id] = probability;
    markers[id] = uint256(blockhash(block.number - 1)) % period;
    idEnds[id] = endId;
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
    uint256 end = _endFromId(id);
    if (proofPeriod >= periodOf(end)) {
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

  /// @notice Extends the proof end time
  /// @dev The id must have a mapping to an end id, the end must exist, and the end must not have elapsed yet
  /// @param id the id of the proofs to extend. Typically a slot id, the id is mapped to an endId.
  /// @param ending the new end time (in seconds)
  function _extendProofEndTo(bytes32 id, uint256 ending) internal {
    bytes32 endId = _endId(id);
    uint256 end = ends[endId];
    // TODO: create type aliases for id and endId so that _end() can return
    // EndId storage and we don't need to replicate the below require here
    require (end > 0, "Proof ending doesn't exist");
    require (block.timestamp <= end, "Proof already ended");
    ends[endId] = ending;
  }

  event ProofSubmitted(bytes32 id, bytes proof);
}
