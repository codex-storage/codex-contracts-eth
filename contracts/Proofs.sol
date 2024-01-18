// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "./Configuration.sol";
import "./Requests.sol";
import "./Periods.sol";
import "./Verifier.sol";

abstract contract Proofs is Periods {
  ProofConfig private _config;
  IVerifier private _verifier;

  constructor(
    ProofConfig memory config,
    IVerifier verifier
  ) Periods(config.period) {
    require(block.number > 256, "Insufficient block height");
    _config = config;
    _verifier = verifier;
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
    // To ensure the pointer does not remain in downtime for many consecutive
    // periods, for each period increase, move the pointer 67 blocks. We've
    // chosen a prime number to ensure that we don't get cycles.
    uint256 periodNumber = (Period.unwrap(period) * 67) % 256;
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

  function submitProof(SlotId id, uint256[8] calldata proof) public {
    require(!_received[id][_blockPeriod()], "Proof already submitted");
    uint256[2] memory a;
    uint256[2][2] memory b;
    uint256[2] memory c;
    a[0] = proof[0];
    a[1] = proof[1];
    b[0][0] = proof[2];
    b[0][1] = proof[3];
    b[1][0] = proof[4];
    b[1][1] = proof[5];
    c[0] = proof[6];
    c[1] = proof[7];

    // TODO: The `pubSignals` should be constructed from information that we already know:
    //  - external entropy (for example some fresh ethereum block header) - this gives us the unbiased randomness we use to sample which cells to prove
    //  - the dataset root (which dataset we prove)
    //  - and the slot index (which slot out of that dataset we prove)
    uint256[3] memory pubSignals;
    pubSignals[0] = 7538754537;
    pubSignals[
      1
    ] = 16074246370508166450132968585287196391860062495017081813239200574579640171677;
    pubSignals[2] = 3;

    require(_verifier.verifyProof(a, b, c, pubSignals), "Invalid proof");
    _received[id][_blockPeriod()] = true;
    emit ProofSubmitted(id);
  }

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
