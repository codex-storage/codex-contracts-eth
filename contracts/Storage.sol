// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Contracts.sol";
import "./Proofs.sol";
import "./Stakes.sol";

contract Storage is Contracts, Proofs, Stakes {

  uint private stakeAmount;

  constructor(IERC20 token, uint _stakeAmount) Stakes(token) {
    stakeAmount = _stakeAmount;
  }

  function newContract(
    uint _duration,
    uint _size,
    bytes32 _contentHash,
    uint _proofPeriod,
    uint _proofTimeout,
    bytes32 _nonce,
    uint _price,
    address _host,
    uint _bidExpiry,
    bytes memory requestSignature,
    bytes memory bidSignature
  )
    public
  {
    require(_stake(_host) >= stakeAmount, "Insufficient stake");
    _lockStake(_host);
    bytes32 id = _newContract(
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
    _expectProofs(id, _proofPeriod, _proofTimeout, _duration);
  }

  function duration(bytes32 contractId) public view returns (uint) {
    return _duration(contractId);
  }

  function size(bytes32 contractId) public view returns (uint) {
    return _size(contractId);
  }

  function contentHash(bytes32 contractId) public view returns (bytes32) {
    return _contentHash(contractId);
  }

  function price(bytes32 contractId) public view returns (uint) {
    return _price(contractId);
  }

  function host(bytes32 contractId) public view returns (address) {
    return _host(contractId);
  }

  function proofPeriod(bytes32 contractId) public view returns (uint) {
    return _period(contractId);
  }

  function proofTimeout(bytes32 contractId) public view returns (uint) {
    return _timeout(contractId);
  }

  function missingProofs(bytes32 contractId) public view returns (uint) {
    return _missed(contractId);
  }

  function isProofRequired(
    bytes32 contractId,
    uint blocknumber
  )
    public view
    returns (bool)
  {
    return _isProofRequired(contractId, blocknumber);
  }

  function isProofTimedOut(
    bytes32 contractId,
    uint blocknumber
  )
    public view
    returns (bool)
  {
    return _isProofTimedOut(contractId, blocknumber);
  }

  function submitProof(
    bytes32 contractId,
    uint blocknumber,
    bool proof
  )
    public
  {
    _submitProof(contractId, blocknumber, proof);
  }

  function markProofAsMissing(bytes32 contractId, uint blocknumber) public {
    _markProofAsMissing(contractId, blocknumber);
  }

  function increaseStake(uint amount) public {
    _increaseStake(amount);
  }

  function withdrawStake() public {
    _withdrawStake();
  }
}
