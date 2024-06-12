// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "./Configuration.sol";
import "./Requests.sol";
import "./Periods.sol";
import "./Groth16.sol";

/**
 * @title Proofs
 * @notice Abstract contract that handles proofs tracking, validation and reporting functionality
 */
abstract contract Proofs is Periods {
  ProofConfig private _config;
  IGroth16Verifier private _verifier;

  /**
   * Creation of the contract requires at least 256 mined blocks!
   * @param config Proving configuration
   */
  constructor(
    ProofConfig memory config,
    IGroth16Verifier verifier
  ) Periods(config.period) {
    require(block.number > 256, "Insufficient block height");
    _config = config;
    _verifier = verifier;
  }

  mapping(SlotId => uint256) private _slotStarts; // TODO: Should be smaller then uint256
  mapping(SlotId => uint256) private _probabilities;
  mapping(SlotId => uint256) private _missed; // TODO: Should be smaller then uint256
  mapping(SlotId => mapping(Period => bool)) private _received;
  mapping(SlotId => mapping(Period => bool)) private _missing;

  function slotState(SlotId id) public view virtual returns (SlotState);

  /**
   * @return Number of missed proofs since Slot was Filled
   */
  function missingProofs(SlotId slotId) public view returns (uint256) {
    return _missed[slotId];
  }

  /**
   * @param slotId Slot's ID for which the proofs should be resetted
   * @notice Resets the missing proofs counter to zero
   */
  function _resetMissingProofs(SlotId slotId) internal {
    _missed[slotId] = 0;
  }

  /**
   * @param id Slot's ID for which the proofs should be started to require
   * @param probability Integer which specifies the probability of how often the proofs will be required. Lower number means higher probability.
   * @notice Notes down the block's timestamp as Slot's starting time for requiring proofs
   *     and saves the required probability.
   */
  function _startRequiringProofs(SlotId id, uint256 probability) internal {
    _slotStarts[id] = block.timestamp;
    _probabilities[id] = probability;
  }

  /**
   * @param id Slot's ID for which the pointer should be calculated
   * @param period Period for which the pointer should be calculated
   * @return Uint8 pointer that is stable over current Period and points to one block over the last 256 block's window.
   * @dev For more information see https://github.com/codex-storage/codex-research/blob/master/design/storage-proof-timing.md
   */
  function _getPointer(SlotId id, Period period) internal view returns (uint8) {
    uint256 blockNumber = block.number % 256;
    // To ensure the pointer does not remain in downtime for many consecutive
    // periods, for each period increase, move the pointer 67 blocks. We've
    // chosen a prime number to ensure that we don't get cycles.
    uint256 periodNumber = (Period.unwrap(period) * 67) % 256;
    uint256 idOffset = uint256(SlotId.unwrap(id)) % 256;
    uint256 pointer = (blockNumber + periodNumber + idOffset) % 256;
    return uint8(pointer);
  }

  /**
   * @param id Slot's ID for which the pointer should be calculated
   * @return Uint8 pointer that is stable over current Period and points to one block over the last 256 block's window.
   * @dev For more information see https://github.com/codex-storage/codex-research/blob/master/design/storage-proof-timing.md
   */
  function getPointer(SlotId id) public view returns (uint8) {
    return _getPointer(id, _blockPeriod());
  }

  /**
   * @param pointer Pointer that points to one block in the last 256 blocks window
   * @return Challenge that should be used for generation of proofs
   */
  function _getChallenge(uint8 pointer) internal view returns (bytes32) {
    bytes32 hash = blockhash(block.number - 1 - pointer);
    assert(uint256(hash) != 0);
    return keccak256(abi.encode(hash));
  }

  /**
   * @param id Slot's ID for which the challenge should be calculated
   * @param period Period for which the challenge should be calculated
   * @return Challenge that should be used for generation of proofs
   */
  function _getChallenge(
    SlotId id,
    Period period
  ) internal view returns (bytes32) {
    return _getChallenge(_getPointer(id, period));
  }

  /**
   * @param id Slot's ID for which the challenge should be calculated
   * @return Challenge for current Period that should be used for generation of proofs
   */
  function getChallenge(SlotId id) public view returns (bytes32) {
    return _getChallenge(id, _blockPeriod());
  }

  /**
   * @param id Slot's ID for which the requirements are gathered. Its state needs to be Filled.
   * @param period Period for which the requirements are gathered.
   */
  function _getProofRequirement(
    SlotId id,
    Period period
  ) internal view returns (bool isRequired, uint8 pointer) {
    SlotState state = slotState(id);
    Period start = _periodOf(_slotStarts[id]);
    if (state != SlotState.Filled || !_isAfter(period, start)) {
      return (false, 0);
    }
    pointer = _getPointer(id, period);
    bytes32 challenge = _getChallenge(pointer);

    /// Scaling of the probability according the downtime configuration
    /// See: https://github.com/codex-storage/codex-research/blob/master/design/storage-proof-timing.md#pointer-downtime
    uint256 probability = (_probabilities[id] * (256 - _config.downtime)) / 256;
    isRequired = probability == 0 || uint256(challenge) % probability == 0;
  }

  /**
   * @see isProofRequired
   */
  function _isProofRequired(
    SlotId id,
    Period period
  ) internal view returns (bool) {
    bool isRequired;
    uint8 pointer;
    (isRequired, pointer) = _getProofRequirement(id, period);
    return isRequired && pointer >= _config.downtime;
  }

  /**
   * @param id Slot's ID for which the proof requirements should be checked. Its state needs to be Filled.
   * @return bool indicating if proof is required for current period
   */
  function isProofRequired(SlotId id) public view returns (bool) {
    return _isProofRequired(id, _blockPeriod());
  }

  /**
   * Proof Downtime specifies part of the Period when the proof is not required even
   * if the proof should be required. This function returns true if the pointer is
   * in downtime (hence no proof required now) and at the same time the proof
   * will be required later on in the Period.
   *
   * @dev see for more info about downtime: https://github.com/codex-storage/codex-research/blob/master/design/storage-proof-timing.md#pointer-downtime
   * @param id SlotId for which the proof requirements should be checked. Its state needs to be Filled.
   * @return bool
   */
  function willProofBeRequired(SlotId id) public view returns (bool) {
    bool isRequired;
    uint8 pointer;
    (isRequired, pointer) = _getProofRequirement(id, _blockPeriod());
    return isRequired && pointer < _config.downtime;
  }

  /**
   * Function used for submitting and verification of the proofs.
   *
   * @dev Reverts when proof is invalid or had been already submitted.
   * @dev Emits ProofSubmitted event.
   * @param id Slot's ID for which the proof requirements should be checked
   * @param proof Groth16 proof
   * @param pubSignals Proofs public input
   */
  function _proofReceived(
    SlotId id,
    Groth16Proof calldata proof,
    uint[] memory pubSignals
  ) internal {
    require(!_received[id][_blockPeriod()], "Proof already submitted");
    require(_verifier.verify(proof, pubSignals), "Invalid proof");
    _received[id][_blockPeriod()] = true;
    emit ProofSubmitted(id);
  }

  /**
   * Function used to mark proof as missing.
   *
   * @param id Slot's ID for which the proof is missing
   * @param missedPeriod Period for which the proof was missed
   * @dev Reverts when:
   *    - missedPeriod has not ended yet ended
   *    - missing proof was time-barred
   *    - proof was not required for missedPeriod period
   *    - proof was already marked as missing
   */
  function _markProofAsMissing(SlotId id, Period missedPeriod) internal {
    uint256 end = _periodEnd(missedPeriod);
    require(end < block.timestamp, "Period has not ended yet");
    require(block.timestamp < end + _config.timeout, "Validation timed out");
    require(!_received[id][missedPeriod], "Proof was submitted, not missing");
    require(_isProofRequired(id, missedPeriod), "Proof was not required");
    require(!_missing[id][missedPeriod], "Proof already marked as missing");
    _missing[id][missedPeriod] = true;
    _missed[id] += 1;
  }

  event ProofSubmitted(SlotId id);
}
