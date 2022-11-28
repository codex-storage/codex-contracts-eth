// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./EnumerableSetExtensions.sol";

// exposes public functions for testing
contract TestClearableBytes32Set {
  using EnumerableSet for EnumerableSet.Bytes32Set;
  using EnumerableSetExtensions for EnumerableSetExtensions.ClearableBytes32Set;

  event OperationResult(bool result);

  EnumerableSetExtensions.ClearableBytes32Set private _set;

  function values()
    public
    view
    returns (bytes32[] memory)
  {
    return _set.values();
  }

  function add(bytes32 value)
    public
  {
    bool result = _set.add(value);
    emit OperationResult(result);
  }

  function remove(bytes32 value)
    public
  {
    bool result = _set.remove(value);
    emit OperationResult(result);
  }

  function clear()
    public
  {
    _set.clear();
  }

  function length()
    public
    view
    returns (uint256)
  {
    return _set.length();
  }

  function contains(bytes32 value)
    public
    view
    returns (bool)
  {
    return _set.contains(value);
  }
}
