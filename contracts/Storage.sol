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

  function getRequest(bytes32 requestId) public view returns (Request memory) {
    return _request(requestId);
  }

  function getHost(bytes32 requestId) public view returns (address) {
    return _host(requestId);
  }

  function missingProofs(bytes32 slotId) public view returns (uint256) {
    return _missed(slotId);
  }

  function isProofRequired(bytes32 slotId) public view returns (bool) {
    return _isProofRequired(slotId);
  }

  function willProofBeRequired(bytes32 slotId) public view returns (bool) {
    return _willProofBeRequired(slotId);
  }

  function getChallenge(bytes32 slotId) public view returns (bytes32) {
    return _getChallenge(slotId);
  }

  function getPointer(bytes32 slotId) public view returns (uint8) {
    return _getPointer(slotId);
  }

  function submitProof(bytes32 slotId, bytes calldata proof) public {
    _submitProof(slotId, proof);
  }

  function markProofAsMissing(bytes32 slotId, uint256 period) public {
    _markProofAsMissing(slotId, period);
    if (_missed(slotId) % slashMisses == 0) {
      _slash(_host(slotId), slashPercentage);
    }
  }
}
