// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Marketplace.sol";
import "./Proofs.sol";
import "./Collateral.sol";

contract Storage is Collateral, Marketplace, Proofs {
  uint256 public collateralAmount;
  uint256 public slashMisses;
  uint256 public slashPercentage;

  mapping(bytes32 => bool) private finished;

  constructor(
    IERC20 token,
    uint256 _proofPeriod,
    uint256 _proofTimeout,
    uint8 _proofDowntime,
    uint256 _collateralAmount,
    uint256 _slashMisses,
    uint256 _slashPercentage
  )
    Marketplace(token, _collateralAmount)
    Proofs(_proofPeriod, _proofTimeout, _proofDowntime)
  {
    collateralAmount = _collateralAmount;
    slashMisses = _slashMisses;
    slashPercentage = _slashPercentage;
  }

  function startContract(bytes32 id) public {
    Offer storage offer = _offer(id);
    require(msg.sender == offer.host, "Only host can call this function");
    Request storage request = _request(offer.requestId);
    _expectProofs(id, request.proofProbability, request.duration);
  }

  function finishContract(bytes32 id) public {
    require(block.timestamp > proofEnd(id), "Contract has not ended yet");
    require(!finished[id], "Contract already finished");
    finished[id] = true;
    Offer storage offer = _offer(id);
    require(token.transfer(offer.host, offer.price), "Payment failed");
  }

  function proofPeriod() public view returns (uint256) {
    return _period();
  }

  function proofTimeout() public view returns (uint256) {
    return _timeout();
  }

  function proofEnd(bytes32 contractId) public view returns (uint256) {
    return _end(contractId);
  }

  function missingProofs(bytes32 contractId) public view returns (uint256) {
    return _missed(contractId);
  }

  function isProofRequired(bytes32 contractId) public view returns (bool) {
    return _isProofRequired(contractId);
  }

  function submitProof(bytes32 contractId, bool proof) public {
    _submitProof(contractId, proof);
  }

  function markProofAsMissing(bytes32 contractId, uint256 period) public {
    _markProofAsMissing(contractId, period);
    if (_missed(contractId) % slashMisses == 0) {
      Offer storage offer = _offer(contractId);
      _slash(offer.host, slashPercentage);
    }
  }
}
