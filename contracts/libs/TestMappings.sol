// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Mappings.sol";

// exposes public functions for testing
contract TestMappings {
  using Mappings for Mappings.Mapping;

  event OperationResult(bool result);

  Mappings.Mapping private _map;

  function totalCount() public view returns (uint256) {
    return _map.count();
  }

  function count(Mappings.KeyId key) public view returns (uint256) {
    return _map.count(key);
  }

  function keyExists(Mappings.KeyId key) public view returns (bool) {
    return _map.exists(key);
  }

  function valueExists(Mappings.KeyId key, Mappings.ValueId value)
    public
    view
    returns (bool)
  {
    return _map.exists(key, value);
  }

  function keys() public view returns (Mappings.KeyId[] memory) {
    return _map.keys();
  }

  function values(Mappings.KeyId key)
    public
    view
    returns (Mappings.ValueId[] memory)
  {
    return _map.values(key);
  }

  function insertKey(Mappings.KeyId key) public returns (bool success) {
    success = _map.insertKey(key);
    emit OperationResult(success);
  }

  function insertValue(Mappings.KeyId key, Mappings.ValueId value)
    public
    returns (bool success)
  {
    success = _map.insertValue(key, value);
    emit OperationResult(success);
  }

  function insert(Mappings.KeyId key, Mappings.ValueId value)
    public
    returns (bool success)
  {
    success = _map.insert(key, value);
    emit OperationResult(success);
  }

  function deleteKey(Mappings.KeyId key) public returns (bool success) {
    success = _map.deleteKey(key);
    emit OperationResult(success);
  }

  function deleteValue(Mappings.KeyId key,
                       Mappings.ValueId value)
    public
    returns (bool success)
  {
    success = _map.deleteValue(key, value);
    emit OperationResult(success);
  }

  function clear(Mappings.KeyId key)
    public
    returns (bool success)
  {
    success = _map.clear(key);
    emit OperationResult(success);
  }
}
