// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "./Configuration.sol";
import "./Requests.sol";
import "./Periods.sol";

abstract contract Proofs is Periods {
  error Proofs_InsufficientBlockHeight();
  error Proofs_InvalidProof();
  error Proofs_ProofAlreadySubmitted();
  error Proofs_PeriodNotEnded();
  error Proofs_ValidationTimedOut();
  error Proofs_ProofNotMissing();
  error Proofs_ProofNotRequired();
  error Proofs_ProofAlreadyMarkedMissing();

  ProofConfig private _config;

  constructor(ProofConfig memory config) Periods(config.period) {
    if (block.number <= 256) {
      revert Proofs_InsufficientBlockHeight();
    }

    _config = config;
  }

  mapping(SlotId => uint256) private _slotStarts;
  mapping(SlotId => uint256) private _probabilities;
  mapping(SlotId => uint256) private _missed;
  mapping(SlotId => mapping(Period => bool)) private _received;
  mapping(SlotId => mapping(Period => bool)) private _missing;

  function slotState(SlotId id) public view virtual returns (SlotState);

  function missingProofs(SlotId slotId) public view returns (uint256) {
    return _missed[slotId];
  }

  function _resetMissingProofs(SlotId slotId) internal {
    _missed[slotId] = 0;
  }

  function _startRequiringProofs(SlotId id, uint256 probability) internal {
    _slotStarts[id] = block.timestamp;
    _probabilities[id] = probability;
  }

  function _getPointer(SlotId id, Period period) internal view returns (uint8) {
    uint256 blockNumber = block.number % 256;
    uint256 periodNumber = Period.unwrap(period) % 256;
    uint256 idOffset = uint256(SlotId.unwrap(id)) % 256;
    uint256 pointer = (blockNumber + periodNumber + idOffset) % 256;
    return uint8(pointer);
  }

  function getPointer(SlotId id) public view returns (uint8) {
    return _getPointer(id, _blockPeriod());
  }

  function _getChallenge(uint8 pointer) internal view returns (bytes32) {
    bytes32 hash = blockhash(block.number - 1 - pointer);
    assert(uint256(hash) != 0);
    return keccak256(abi.encode(hash));
  }

  function _getChallenge(
    SlotId id,
    Period period
  ) internal view returns (bytes32) {
    return _getChallenge(_getPointer(id, period));
  }

  function getChallenge(SlotId id) public view returns (bytes32) {
    return _getChallenge(id, _blockPeriod());
  }

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
    uint256 probability = (_probabilities[id] * (256 - _config.downtime)) / 256;
    isRequired = probability == 0 || uint256(challenge) % probability == 0;
  }

  function _isProofRequired(
    SlotId id,
    Period period
  ) internal view returns (bool) {
    bool isRequired;
    uint8 pointer;
    (isRequired, pointer) = _getProofRequirement(id, period);
    return isRequired && pointer >= _config.downtime;
  }

  function isProofRequired(SlotId id) public view returns (bool) {
    return _isProofRequired(id, _blockPeriod());
  }

  function willProofBeRequired(SlotId id) public view returns (bool) {
    bool isRequired;
    uint8 pointer;
    (isRequired, pointer) = _getProofRequirement(id, _blockPeriod());
    return isRequired && pointer < _config.downtime;
  }

  function submitProof(SlotId id, bytes calldata proof) public {
    // TODO: replace by actual check
    if (proof.length == 0) {
      revert Proofs_InvalidProof();
    }

    if (_received[id][_blockPeriod()]) {
      revert Proofs_ProofAlreadySubmitted();
    }

    _received[id][_blockPeriod()] = true;
    emit ProofSubmitted(id, proof);
  }

  function _markProofAsMissing(SlotId id, Period missedPeriod) internal {
    uint256 end = _periodEnd(missedPeriod);
    if (end >= block.timestamp) {
      revert Proofs_PeriodNotEnded();
    }

    if (block.timestamp >= end + _config.timeout) {
      revert Proofs_ValidationTimedOut();
    }

    if (_received[id][missedPeriod]) {
      revert Proofs_ProofNotMissing();
    }

    if (!_isProofRequired(id, missedPeriod)) {
      revert Proofs_ProofNotRequired();
    }

    if (_missing[id][missedPeriod]) {
      revert Proofs_ProofAlreadyMarkedMissing();
    }

    _missing[id][missedPeriod] = true;
    _missed[id] += 1;
  }

  event ProofSubmitted(SlotId id, bytes proof);
}
