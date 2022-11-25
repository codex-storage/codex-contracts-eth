// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./libs/Mappings.sol";

// exposes public functions for testing
contract TestMappings {
  using Mappings for Mappings.Mapping;

  event OperationResult(bool result);

  Mappings.Mapping private _map;

  function getTotalValueCount() public view returns (uint256) {
    return _map.getValueCount();
  }

  function getValueCount(Mappings.KeyId keyId) public view returns (uint256) {
    return _map.getValueCount(keyId);
  }

  function keyExists(Mappings.KeyId keyId) public view returns (bool) {
    return _map.keyExists(keyId);
  }

  function valueExists(Mappings.ValueId valueId)
    public
    view
    returns (bool)
  {
    return _map.valueExists(valueId);
  }

  function getKeyIds() public view returns (Mappings.KeyId[] memory) {
    return _map.getKeyIds();
  }

  function getValueIds(Mappings.KeyId keyId)
    public
    view
    returns (Mappings.ValueId[] memory)
  {
    return _map.getValueIds(keyId);
  }

  function insertKey(Mappings.KeyId keyId) public returns (bool success) {
    success = _map.insertKey(keyId);
    emit OperationResult(success);
  }

  function insertValue(Mappings.KeyId keyId, Mappings.ValueId valueId)
    public
    returns (bool success)
  {
    success = _map.insertValue(keyId, valueId);
    emit OperationResult(success);
  }

  function insert(Mappings.KeyId keyId, Mappings.ValueId valueId)
    public
    returns (bool success)
  {
    success = _map.insert(keyId, valueId);
    emit OperationResult(success);
  }

  function deleteKey(Mappings.KeyId keyId) public returns (bool success) {
    success = _map.deleteKey(keyId);
    emit OperationResult(success);
  }

  function deleteValue(Mappings.ValueId valueId)
    public
    returns (bool success)
  {
    success = _map.deleteValue(valueId);
    emit OperationResult(success);
  }

  function clearValues(Mappings.KeyId keyId)
    public
    returns (bool success)
  {
    success = _map.clearValues(keyId);
    emit OperationResult(success);
  }
}
