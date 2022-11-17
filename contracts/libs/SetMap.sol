// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

library SetMap {
  using EnumerableSet for EnumerableSet.Bytes32Set;

  type Key is bytes32;

  struct AddressSetMap {
    mapping(Key =>
          mapping(address =>
                  mapping(uint8 =>
                          EnumerableSet.Bytes32Set))) _values;
    mapping(Key => uint8) _index;
    EnumerableSet.Bytes32Set _keys;
  }

  /// @notice Returns the EnumerableSet.Bytes32 containing the values for a key
  ///         and address in an AddressSetMap
  /// @dev This is used internally to the library only. `.values()` should only
  ///      be called on its return value in a view/pure function.
  /// @param map AddressSetMap to list values
  /// @param key key of the values to be listed
  /// @param addr address of the values to be listed
  /// @return bytes32[] array of bytes32 values
  function _set(AddressSetMap storage map,
                Key key,
                address addr)
    private
    view
    returns (EnumerableSet.Bytes32Set storage)
  {
    uint8 id = map._index[key];
    return map._values[key][addr][id];
  }

  /// @notice Lists all values for a key and address in an AddressSetMap
  /// @param map AddressSetMap to list values
  /// @param key key of the values to be listed
  /// @param addr address of the values to be listed
  /// @return bytes32[] array of bytes32 values
  function values(AddressSetMap storage map,
                  Key key,
                  address addr)
    internal
    view
    returns (bytes32[] memory)
  {
    return _set(map, key, addr).values();
  }

  function _toKeys(bytes32[] memory array)
    private
    pure
    returns (Key[] memory result)
  {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      result := array
    }
  }

  /// @notice Lists all keys for an AddressSetMap
  /// @param map AddressSetMap to list keys
  /// @return bytes32[] array of bytes32 values
  function keys(AddressSetMap storage map)
    internal
    view
    returns (Key[] memory)
  {
    return _toKeys(map._keys.values());
  }

  /// @notice Adds a single value to an AddressSetMap
  /// @param map AddressSetMap to add the value to
  /// @param key key of the value to be added
  /// @param addr address of the value to be added
  /// @param value the value to be added
  /// @return true if the value was added to the set, that is if it was not
  ///         already present.
  function add(AddressSetMap storage map,
               Key key,
               address addr,
               bytes32 value)
    internal
    returns (bool)
  {
    map._keys.add(Key.unwrap(key));
    return _set(map, key, addr).add(value);
  }

  /// @notice Removes a single value from an AddressSetMap
  /// @param map AddressSetMap to remove the value from
  /// @param key key of the value to be removed
  /// @param addr address of the value to be removed
  /// @param value the value to be removed
  /// @return true if the value was removed from the set, that is if it was
  ///         present.
  function remove(AddressSetMap storage map,
                  Key key,
                  address addr,
                  bytes32 value)
    internal
    returns (bool)
  {
    EnumerableSet.Bytes32Set storage set = _set(map, key, addr);
    bool success = set.remove(value);
    if (success && set.length() == 0) {
      map._keys.remove(Key.unwrap(key));
    }
    return success;
  }

  /// @notice Clears values for a key.
  /// @dev Does not clear the addresses for the key, simply updates an index
  ///      such that the next time values for that key and address are
  ///      retrieved, it will return an empty array.
  /// @param map AddressSetMap for which to clear values
  /// @param key key for which to clear values
  function clear(AddressSetMap storage map, Key key)
    internal
  {
    map._index[key]++;
  }
}