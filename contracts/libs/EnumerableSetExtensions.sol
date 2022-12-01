// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

library EnumerableSetExtensions {
  using EnumerableSet for EnumerableSet.Bytes32Set;
  using EnumerableSet for EnumerableSet.AddressSet;

  struct ClearableBytes32Set {
    mapping(uint256 =>
            EnumerableSet.Bytes32Set) _values;
    uint256 _index;
  }

  /// @notice Returns the EnumerableSet.Bytes32 containing the values
  /// @dev This is used internally to the library only. `.values()` should only
  ///      be called on its return value in a view/pure function.
  /// @param map ClearableBytes32Set to list values
  /// @return EnumerableSet.Bytes32 containing values
  function _set(ClearableBytes32Set storage map)
    private
    view
    returns (EnumerableSet.Bytes32Set storage)
  {
    return map._values[map._index];
  }

  /// @notice Lists all values for a key and address in an ClearableBytes32Set
  /// @param map ClearableBytes32Set to list values
  /// @return bytes32[] array of bytes32 values
  function values(ClearableBytes32Set storage map)
    internal
    view
    returns (bytes32[] memory)
  {
    return _set(map).values();
  }

  /// @notice Adds a single value to a ClearableBytes32Set
  /// @param map Bytes32SetMap to add the value to
  /// @param value the value to be added
  /// @return true if the value was added to the set, that is if it was not
  ///         already present.
  function add(ClearableBytes32Set storage map,
               bytes32 value)
    internal
    returns (bool)
  {
    return _set(map).add(value);
  }

  /// @notice Removes a single value from a ClearableBytes32Set
  /// @param map Bytes32SetMap to remove the value from
  /// @param value the value to be removed
  /// @return true if the value was removed from the set, that is if it was
  ///         present.
  function remove(ClearableBytes32Set storage map,
                  bytes32 value)
    internal
    returns (bool)
  {
    return _set(map).remove(value);
  }

  /// @notice Clears all values.
  /// @dev Updates an index such that the next time values for that key are
  ///      retrieved, it will reference a new EnumerableSet.
  /// @param map ClearableBytes32Set for which to clear values
  function clear(ClearableBytes32Set storage map)
    internal
  {
    map._index++;
  }

  /// @notice Returns the length of values for the set.
  /// @param map ClearableBytes32Set for which to get length of values
  function length(ClearableBytes32Set storage map)
    internal
    view
    returns (uint256)
  {
    return _set(map).length();
  }

  /// @notice Returns the value at index provided.
  /// @param map ClearableBytes32Set for which to get the value
  /// @return bytes32 value at index
  function at(ClearableBytes32Set storage map, uint256 index)
    internal
    view
    returns (bytes32)
  {
    return _set(map).at(index);
  }

  /// @notice Lists all values for a key in an Bytes32SetMap
  /// @param map Bytes32SetMap to list values
  /// @return bytes32[] array of bytes32 values
  function contains(ClearableBytes32Set storage map,
                    bytes32 value)
    internal
    view
    returns (bool)
  {
    return _set(map).contains(value);
  }
}
