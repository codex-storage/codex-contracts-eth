// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Contracts.sol";
import "./Proofs.sol";
import "./Stakes.sol";

contract Storage is Contracts, Proofs, Stakes {
  uint256 public stakeAmount;
  uint256 public slashMisses;
  uint256 public slashPercentage;

  mapping(bytes32 => bool) private finished;

  constructor(
    IERC20 token,
    uint256 _stakeAmount,
    uint256 _slashMisses,
    uint256 _slashPercentage
  ) Stakes(token) {
    stakeAmount = _stakeAmount;
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
    require(_stake(_host) >= stakeAmount, "Insufficient stake");
    _lockStake(_host);
    _token().transferFrom(msg.sender, address(this), _price);
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
    require(_token().transfer(host(id), price(id)), "Payment failed");
    _unlockStake(host(id));
    finished[id] = true;
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

  function stake(address account) public view returns (uint256) {
    return _stake(account);
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

  function increaseStake(uint256 amount) public {
    _increaseStake(amount);
  }

  function withdrawStake() public {
    _withdrawStake();
  }
}
