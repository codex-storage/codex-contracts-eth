// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Contracts.sol";
import "./Proofs.sol";
import "./Collateral.sol";

contract Storage is Contracts, Proofs, Collateral {
  uint256 public collateralAmount;
  uint256 public slashMisses;
  uint256 public slashPercentage;

  mapping(bytes32 => bool) private finished;

  constructor(
    IERC20 token,
    uint256 _collateralAmount,
    uint256 _slashMisses,
    uint256 _slashPercentage
  ) Collateral(token) {
    collateralAmount = _collateralAmount;
    slashMisses = _slashMisses;
    slashPercentage = _slashPercentage;
  }

  function newContract(
    uint256 _duration,
    uint256 _size,
    bytes32 _contentHash,
    uint256 _proofPeriod,
    uint256 _proofTimeout,
    bytes32 _nonce,
    uint256 _price,
    address _host,
    uint256 _bidExpiry,
    bytes memory requestSignature,
    bytes memory bidSignature
  ) public {
    require(balanceOf(_host) >= collateralAmount, "Insufficient collateral");
    bytes32 requestHash = _hashRequest(
      _duration,
      _size,
      _contentHash,
      _proofPeriod,
      _proofTimeout,
      _nonce
    );
    bytes32 bidHash = _hashBid(requestHash, _bidExpiry, _price);
    _createLock(bidHash, _bidExpiry);
    _lock(_host, bidHash);
    token.transferFrom(msg.sender, address(this), _price);
    _newContract(
      _duration,
      _size,
      _contentHash,
      _proofPeriod,
      _proofTimeout,
      _nonce,
      _price,
      _host,
      _bidExpiry,
      requestSignature,
      bidSignature
    );
  }

  modifier onlyHost(bytes32 id) {
    require(msg.sender == host(id), "Only host can call this function");
    _;
  }

  function startContract(bytes32 id) public onlyHost(id) {
    _expectProofs(id, proofPeriod(id), proofTimeout(id), duration(id));
  }

  function finishContract(bytes32 id) public {
    require(block.number > proofEnd(id), "Contract has not ended yet");
    require(!finished[id], "Contract already finished");
    _unlock(id);
    finished[id] = true;
    require(token.transfer(host(id), price(id)), "Payment failed");
  }

  function duration(bytes32 contractId) public view returns (uint256) {
    return _duration(contractId);
  }

  function size(bytes32 contractId) public view returns (uint256) {
    return _size(contractId);
  }

  function contentHash(bytes32 contractId) public view returns (bytes32) {
    return _contentHash(contractId);
  }

  function price(bytes32 contractId) public view returns (uint256) {
    return _price(contractId);
  }

  function host(bytes32 contractId) public view returns (address) {
    return _host(contractId);
  }

  function proofPeriod(bytes32 contractId) public view returns (uint256) {
    return _proofPeriod(contractId);
  }

  function proofTimeout(bytes32 contractId) public view returns (uint256) {
    return _proofTimeout(contractId);
  }

  function proofEnd(bytes32 contractId) public view returns (uint256) {
    return _end(contractId);
  }

  function missingProofs(bytes32 contractId) public view returns (uint256) {
    return _missed(contractId);
  }

  function isProofRequired(bytes32 contractId, uint256 blocknumber)
    public
    view
    returns (bool)
  {
    return _isProofRequired(contractId, blocknumber);
  }

  function isProofTimedOut(bytes32 contractId, uint256 blocknumber)
    public
    view
    returns (bool)
  {
    return _isProofTimedOut(contractId, blocknumber);
  }

  function submitProof(
    bytes32 contractId,
    uint256 blocknumber,
    bool proof
  ) public {
    _submitProof(contractId, blocknumber, proof);
  }

  function markProofAsMissing(bytes32 contractId, uint256 blocknumber) public {
    _markProofAsMissing(contractId, blocknumber);
    if (_missed(contractId) % slashMisses == 0) {
      _slash(host(contractId), slashPercentage);
    }
  }
}
