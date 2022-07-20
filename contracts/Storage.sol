// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Marketplace.sol";
import "./Proofs.sol";
import "./Collateral.sol";

contract Storage is Collateral, Marketplace {
  uint256 public collateralAmount;
  uint256 public slashMisses;
  uint256 public slashPercentage;

  constructor(
    IERC20 token,
    uint256 _proofPeriod,
    uint256 _proofTimeout,
    uint8 _proofDowntime,
    uint256 _collateralAmount,
    uint256 _slashMisses,
    uint256 _slashPercentage
  )
    Marketplace(
      token,
      _collateralAmount,
      _proofPeriod,
      _proofTimeout,
      _proofDowntime
    )
  {
    collateralAmount = _collateralAmount;
    slashMisses = _slashMisses;
    slashPercentage = _slashPercentage;
  }

  function getRequest(bytes32 id) public view returns (Request memory) {
    return _request(id);
  }

  function getHost(bytes32 id) public view returns (address) {
    return _host(id);
  }

  function missingProofs(bytes32 contractId) public view returns (uint256) {
    return _missed(contractId);
  }

  function isProofRequired(bytes32 contractId) public view returns (bool) {
    return _isProofRequired(contractId);
  }

  function willProofBeRequired(bytes32 contractId) public view returns (bool) {
    return _willProofBeRequired(contractId);
  }

  function getChallenge(bytes32 contractId) public view returns (bytes32) {
    return _getChallenge(contractId);
  }

  function getPointer(bytes32 id) public view returns (uint8) {
    return _getPointer(id);
  }

  function submitProof(bytes32 contractId, bytes calldata proof) public {
    _submitProof(contractId, proof);
  }

  function markProofAsMissing(bytes32 contractId, uint256 period) public {
    _markProofAsMissing(contractId, period);
    if (_missed(contractId) % slashMisses == 0) {
      _slash(_host(contractId), slashPercentage);
    }
  }
}
