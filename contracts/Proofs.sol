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

  function _getChallenges(bytes32 id, uint256 proofperiod)
    internal
    view
    returns (Challenge memory challenge1, Challenge memory challenge2)
  {
    if (
      proofperiod <= periodOf(starts[id]) || proofperiod >= periodOf(ends[id])
    ) {
      bytes32 nullChallenge;
      return (Challenge(false, nullChallenge), Challenge(false, nullChallenge));
    }

    uint256 blocknumber = block.number % 256;
    uint256 periodnumber = proofperiod % 256;
    uint256 idoffset = uint256(id) % 256;

    uint256 pointer1 = (blocknumber + periodnumber + idoffset) % 256;
    uint256 pointer2 = (blocknumber + periodnumber + idoffset + 128) % 256;

    bytes32 blockhash1 = blockhash(block.number - 1 - pointer1);
    bytes32 blockhash2 = blockhash(block.number - 1 - pointer2);

    assert(uint256(blockhash1) != 0);
    assert(uint256(blockhash2) != 0);

    challenge1.challenge = keccak256(abi.encode(blockhash1));
    challenge2.challenge = keccak256(abi.encode(blockhash2));

    challenge1.isProofRequired =
      uint256(challenge1.challenge) % probabilities[id] == 0;
    challenge2.isProofRequired =
      uint256(challenge2.challenge) % probabilities[id] == 0;
  }

  function _isProofRequired(bytes32 id, uint256 proofPeriod)
    internal
    view
    returns (bool)
  {
    Challenge memory challenge1;
    Challenge memory challenge2;
    (challenge1, challenge2) = _getChallenges(id, proofPeriod);
    return challenge1.isProofRequired && challenge2.isProofRequired;
  }

  function _isProofRequired(bytes32 id) internal view returns (bool) {
    return _isProofRequired(id, currentPeriod());
  }

  function _submitProof(bytes32 id, bool proof) internal {
    require(proof, "Invalid proof"); // TODO: replace bool by actual proof
    require(!received[id][currentPeriod()], "Proof already submitted");
    received[id][currentPeriod()] = true;
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

  struct Challenge {
    bool isProofRequired;
    bytes32 challenge;
  }
}
