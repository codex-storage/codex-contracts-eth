// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Marketplace.sol";
import "./Proofs.sol";
import "./Collateral.sol";

contract Storage is Collateral, Marketplace {
  uint256 public collateralAmount;
  uint256 public slashMisses;
  uint256 public slashPercentage;
  uint256 public minCollateralThreshold;

  constructor(
    IERC20 token,
    uint256 _proofPeriod,
    uint256 _proofTimeout,
    uint8 _proofDowntime,
    uint256 _collateralAmount,
    uint256 _slashMisses,
    uint256 _slashPercentage,
    uint256 _minCollateralThreshold
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
    minCollateralThreshold = _minCollateralThreshold;
  }

  function getRequest(bytes32 requestId) public view returns (Request memory) {
    return _request(requestId);
  }

  function getSlot(bytes32 slotId) public view returns (Slot memory) {
    return _slot(slotId);
  }

  function getHost(bytes32 slotId) public view returns (address) {
    return _host(slotId);
  }

  function missingProofs(bytes32 slotId) public view returns (uint256) {
    return _missed(slotId);
  }

  function isProofRequired(bytes32 slotId) public view returns (bool) {
    if(!_slotAcceptsProofs(slotId)) {
      return false;
    }
    return _isProofRequired(slotId);
  }

  function willProofBeRequired(bytes32 slotId) public view returns (bool) {
    if(!_slotAcceptsProofs(slotId)) {
      return false;
    }
    return _willProofBeRequired(slotId);
  }

  function getChallenge(bytes32 slotId) public view returns (bytes32) {
    if(!_slotAcceptsProofs(slotId)) {
      return bytes32(0);
    }
    return _getChallenge(slotId);
  }

  function getPointer(bytes32 slotId) public view returns (uint8) {
    return _getPointer(slotId);
  }

  function submitProof(bytes32 slotId, bytes calldata proof) public {
    _submitProof(slotId, proof);
  }

  function markProofAsMissing(bytes32 slotId, uint256 period)
    public
    slotMustAcceptProofs(slotId)
  {
    _markProofAsMissing(slotId, period);
    address host = _host(slotId);
    if (_missed(slotId) % slashMisses == 0) {
        _slash(host, slashPercentage);

      if (balanceOf(host) < minCollateralThreshold) {
        // When the collateral drops below the minimum threshold, the slot
        // needs to be freed so that there is enough remaining collateral to be
        // distributed for repairs and rewards (with any leftover to be burnt).
        _freeSlot(slotId);
      }
    }
  }
}
