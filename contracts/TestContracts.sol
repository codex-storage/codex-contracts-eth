// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Contracts.sol";

contract TestContracts is Contracts {

  function newContract(
    uint _duration,
    uint _size,
    bytes32 _contentHash,
    uint _price,
    uint _proofPeriod,
    uint _proofTimeout,
    bytes32 _nonce,
    uint _bidExpiry,
    address _host,
    bytes memory requestSignature,
    bytes memory bidSignature
  )
    public
  {
    _newContract(
      _duration,
      _size,
      _contentHash,
      _price,
      _proofPeriod,
      _proofTimeout,
      _nonce,
      _bidExpiry,
      _host,
      requestSignature,
      bidSignature);
  }

  function duration(bytes32 id) public view returns (uint) {
    return _duration(id);
  }

  function size(bytes32 id) public view returns (uint) {
    return _size(id);
  }

  function contentHash(bytes32 id) public view returns (bytes32) {
    return _contentHash(id);
  }

  function price(bytes32 id) public view returns (uint) {
    return _price(id);
  }

  function host(bytes32 id) public view returns (address) {
    return _host(id);
  }
}
