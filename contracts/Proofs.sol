// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "./Configuration.sol";
import "./Requests.sol";
import "./Periods.sol";

abstract contract Proofs is Periods {
  ProofConfig private config;

  constructor(ProofConfig memory _config) Periods(_config.period) {
    require(block.number > 256, "Insufficient block height");
    config = _config;
  }

  mapping(SlotId => uint256) private slotStarts;
  mapping(SlotId => uint256) private probabilities;
  mapping(SlotId => uint256) private missed;
  mapping(SlotId => mapping(Period => bool)) private received;
  mapping(SlotId => mapping(Period => bool)) private missing;

  function slotState(SlotId id) internal view virtual returns (SlotState);

  function missingProofs(SlotId slotId) public view returns (uint256) {
    return missed[slotId];
  }

  function _startRequiringProofs(SlotId id, uint256 probability) internal {
    slotStarts[id] = block.timestamp;
    probabilities[id] = probability;
  }

  function getPointer(SlotId id, Period period) internal view returns (uint8) {
    uint256 blockNumber = block.number % 256;
    uint256 periodNumber = Period.unwrap(period) % 256;
    uint256 idOffset = uint256(SlotId.unwrap(id)) % 256;
    uint256 pointer = (blockNumber + periodNumber + idOffset) % 256;
    return uint8(pointer);
  }

  function getPointer(SlotId id) public view returns (uint8) {
    return getPointer(id, blockPeriod());
  }

  function getChallenge(uint8 pointer) internal view returns (bytes32) {
    bytes32 hash = blockhash(block.number - 1 - pointer);
    assert(uint256(hash) != 0);
    return keccak256(abi.encode(hash));
  }

  function getChallenge(
    SlotId id,
    Period period
  ) internal view returns (bytes32) {
    return getChallenge(getPointer(id, period));
  }

  function getChallenge(SlotId id) public view returns (bytes32) {
    return getChallenge(id, blockPeriod());
  }

  function _getProofRequirement(
    SlotId id,
    Period period
  ) internal view returns (bool isRequired, uint8 pointer) {
    SlotState state = slotState(id);
    Period start = periodOf(slotStarts[id]);
    if (state != SlotState.Filled || !isAfter(period, start)) {
      return (false, 0);
    }
    pointer = getPointer(id, period);
    bytes32 challenge = getChallenge(pointer);
    uint256 probability = (probabilities[id] * (256 - config.downtime)) / 256;
    isRequired = uint256(challenge) % probability == 0;
  }

  function isProofRequired(
    SlotId id,
    Period period
  ) internal view returns (bool) {
    bool isRequired;
    uint8 pointer;
    (isRequired, pointer) = _getProofRequirement(id, period);
    return isRequired && pointer >= config.downtime;
  }

  function isProofRequired(SlotId id) public view returns (bool) {
    return isProofRequired(id, blockPeriod());
  }

  function willProofBeRequired(SlotId id) public view returns (bool) {
    bool isRequired;
    uint8 pointer;
    (isRequired, pointer) = _getProofRequirement(id, blockPeriod());
    return isRequired && pointer < config.downtime;
  }

  function submitProof(SlotId id, bytes calldata proof) public {
    require(proof.length > 0, "Invalid proof"); // TODO: replace by actual check
    require(!received[id][blockPeriod()], "Proof already submitted");
    received[id][blockPeriod()] = true;
    emit ProofSubmitted(id, proof);
  }

  function _markProofAsMissing(SlotId id, Period missedPeriod) internal {
    uint256 end = periodEnd(missedPeriod);
    require(end < block.timestamp, "Period has not ended yet");
    require(block.timestamp < end + config.timeout, "Validation timed out");
    require(!received[id][missedPeriod], "Proof was submitted, not missing");
    require(isProofRequired(id, missedPeriod), "Proof was not required");
    require(!missing[id][missedPeriod], "Proof already marked as missing");
    missing[id][missedPeriod] = true;
    missed[id] += 1;
  }

  event ProofSubmitted(SlotId id, bytes proof);
}
