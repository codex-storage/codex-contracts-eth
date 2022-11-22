// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./SetMap.sol";

// exposes public functions for testing
contract TestBytes32SetMap {
  using SetMap for SetMap.Bytes32SetMap;

  event OperationResult(bool result);

  SetMap.Bytes32SetMap private _set;

  function values(SetMap.Bytes32SetMapKey key,
                  address addr)
    public
    view
    returns (bytes32[] memory)
  {
    return _set.values(key, addr);
  }

  function add(SetMap.Bytes32SetMapKey key,
               address addr,
               bytes32 value)
    public
  {
    bool result = _set.add(key, addr, value);
    emit OperationResult(result);
  }

  function remove(SetMap.Bytes32SetMapKey key,
                  address addr,
                  bytes32 value)
    public
  {
    bool result = _set.remove(key, addr, value);
    emit OperationResult(result);
  }

  function clear(SetMap.Bytes32SetMapKey key)
    public
  {
    _set.clear(key);
  }

  function length(SetMap.Bytes32SetMapKey key,
                  address addr)
    public
    view
    returns (uint256)
  {
    return _set.length(key, addr);
  }
}

contract TestAddressBytes32SetMap {
  using SetMap for SetMap.AddressBytes32SetMap;

  event OperationResult(bool result);

  SetMap.AddressBytes32SetMap private _set;

  function values(SetMap.AddressBytes32SetMapKey key)
    public
    view
    returns (bytes32[] memory)
  {
    return _set.values(key);
  }

  function add(SetMap.AddressBytes32SetMapKey key,
               bytes32 value)
    public
  {
    bool result = _set.add(key, value);
    emit OperationResult(result);
  }

  function remove(SetMap.AddressBytes32SetMapKey key,
                  bytes32 value)
    public
  {
    bool result = _set.remove(key, value);
    emit OperationResult(result);
  }

  function clear(SetMap.AddressBytes32SetMapKey key)
    public
  {
    _set.clear(key);
  }
}

contract TestBytes32AddressSetMap {
  using EnumerableSet for EnumerableSet.Bytes32Set;
  using SetMap for SetMap.Bytes32AddressSetMap;

  event OperationResult(bool result);

  SetMap.Bytes32AddressSetMap private _set;

  function keys()
    view
    public
    returns (bytes32[] memory)
  {
    return _set._keys.values();
  }

  function values(SetMap.Bytes32AddressSetMapKey key)
    public
    view
    returns (address[] memory)
  {
    return _set.values(key);
  }

  function contains(SetMap.Bytes32AddressSetMapKey key,
                    address addr)
    public
    view
    returns (bool)
  {
    return _set.contains(key, addr);
  }

  function length(SetMap.Bytes32AddressSetMapKey key)
    public
    view
    returns (uint256)
  {
    return _set.length(key);
  }

  function add(SetMap.Bytes32AddressSetMapKey key,
               address value)
    public
  {
    bool result = _set.add(key, value);
    emit OperationResult(result);
  }

  function remove(SetMap.Bytes32AddressSetMapKey key,
                  address value)
    public
  {
    bool result = _set.remove(key, value);
    emit OperationResult(result);
  }

  function clear(SetMap.Bytes32AddressSetMapKey key)
    public
  {
    _set.clear(key);
  }
}
