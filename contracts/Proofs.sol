// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "./Requests.sol";
import "./Periods.sol";

abstract contract Proofs is Periods {
  uint256 private immutable timeout;
  uint8 private immutable downtime;

  constructor(
    uint256 __period,
    uint256 __timeout,
    uint8 __downtime
  ) Periods(__period) {
    require(block.number > 256, "Insufficient block height");
    timeout = __timeout;
    downtime = __downtime;
  }

  mapping(SlotId => bool) private slotIds;
  mapping(SlotId => uint256) private slotStarts;
  mapping(SlotId => uint256) private probabilities;
  mapping(SlotId => uint256) private missed;
  mapping(SlotId => mapping(Period => bool)) private received;
  mapping(SlotId => mapping(Period => bool)) private missing;

  function _timeout() internal view returns (uint256) {
    return timeout;
  }

  // Override this to let the proving system know when proofs for a
  // slot are no longer required.
  function proofEnd(SlotId id) public view virtual returns (uint256);

  function missingProofs(SlotId slotId) public view returns (uint256) {
    return missed[slotId];
  }

  /// @notice Informs the contract that proofs should be expected for id
  /// @dev Requires that the id is not already in use
  /// @param probability The probability that a proof should be expected
  function _startRequiringProofs(SlotId id, uint256 probability) internal {
    require(!slotIds[id], "Proofs already required for slot");
    slotIds[id] = true;
    slotStarts[id] = block.timestamp;
    probabilities[id] = probability;
  }

  function _stopRequiringProofs(SlotId id) internal {
    require(slotIds[id], "Proofs not required for slot");
    slotIds[id] = false;
  }

  function _getPointer(
    SlotId id,
    Period proofPeriod
  ) internal view returns (uint8) {
    uint256 blockNumber = block.number % 256;
    uint256 periodNumber = Period.unwrap(proofPeriod) % 256;
    uint256 idOffset = uint256(SlotId.unwrap(id)) % 256;
    uint256 pointer = (blockNumber + periodNumber + idOffset) % 256;
    return uint8(pointer);
  }

  function _getPointer(SlotId id) internal view returns (uint8) {
    return _getPointer(id, blockPeriod());
  }

  function _getChallenge(uint8 pointer) internal view returns (bytes32) {
    bytes32 hash = blockhash(block.number - 1 - pointer);
    assert(uint256(hash) != 0);
    return keccak256(abi.encode(hash));
  }

  function _getChallenge(
    SlotId id,
    Period proofPeriod
  ) internal view returns (bytes32) {
    return _getChallenge(_getPointer(id, proofPeriod));
  }

  function _getChallenge(SlotId id) internal view returns (bytes32) {
    return _getChallenge(id, blockPeriod());
  }

  function _getProofRequirement(
    SlotId id,
    Period proofPeriod
  ) internal view returns (bool isRequired, uint8 pointer) {
    Period start = periodOf(slotStarts[id]);
    Period end = periodOf(proofEnd(id));
    if (!isAfter(proofPeriod, start) || !isBefore(proofPeriod, end)) {
      return (false, 0);
    }
    pointer = _getPointer(id, proofPeriod);
    bytes32 challenge = _getChallenge(pointer);
    uint256 probability = (probabilities[id] * (256 - downtime)) / 256;
    isRequired = slotIds[id] && uint256(challenge) % probability == 0;
  }

  function _isProofRequired(
    SlotId id,
    Period proofPeriod
  ) internal view returns (bool) {
    bool isRequired;
    uint8 pointer;
    (isRequired, pointer) = _getProofRequirement(id, proofPeriod);
    return isRequired && pointer >= downtime;
  }

  function _isProofRequired(SlotId id) internal view returns (bool) {
    return _isProofRequired(id, blockPeriod());
  }

  function _willProofBeRequired(SlotId id) internal view returns (bool) {
    bool isRequired;
    uint8 pointer;
    (isRequired, pointer) = _getProofRequirement(id, blockPeriod());
    return isRequired && pointer < downtime;
  }

  function submitProof(SlotId id, bytes calldata proof) public {
    require(proof.length > 0, "Invalid proof"); // TODO: replace by actual check
    require(!received[id][blockPeriod()], "Proof already submitted");
    received[id][blockPeriod()] = true;
    emit ProofSubmitted(id, proof);
  }

  function _markProofAsMissing(SlotId id, Period missedPeriod) internal {
    uint256 periodEnd = periodEnd(missedPeriod);
    require(periodEnd < block.timestamp, "Period has not ended yet");
    require(block.timestamp < periodEnd + timeout, "Validation timed out");
    require(!received[id][missedPeriod], "Proof was submitted, not missing");
    require(_isProofRequired(id, missedPeriod), "Proof was not required");
    require(!missing[id][missedPeriod], "Proof already marked as missing");
    missing[id][missedPeriod] = true;
    missed[id] += 1;
  }

  event ProofSubmitted(SlotId id, bytes proof);
}
