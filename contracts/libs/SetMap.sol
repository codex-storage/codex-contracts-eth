// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

library SetMap {
  using EnumerableSet for EnumerableSet.Bytes32Set;
  using EnumerableSet for EnumerableSet.AddressSet;

  type Bytes32SetMapKey is bytes32;

  struct Bytes32SetMap {
    mapping(Bytes32SetMapKey =>
          mapping(address =>
                  mapping(uint8 =>
                          EnumerableSet.Bytes32Set))) _values;
    mapping(Bytes32SetMapKey => uint8) _index;
    EnumerableSet.Bytes32Set _keys;
  }

  /// @notice Returns the EnumerableSet.Bytes32 containing the values for a key
  ///         and address in an Bytes32SetMap
  /// @dev This is used internally to the library only. `.values()` should only
  ///      be called on its return value in a view/pure function.
  /// @param map Bytes32SetMap to list values
  /// @param key key of the values to be listed
  /// @param addr address of the values to be listed
  /// @return bytes32[] array of bytes32 values
  function _set(Bytes32SetMap storage map,
                Bytes32SetMapKey key,
                address addr)
    private
    view
    returns (EnumerableSet.Bytes32Set storage)
  {
    uint8 id = map._index[key];
    return map._values[key][addr][id];
  }

  /// @notice Lists all values for a key and address in an Bytes32SetMap
  /// @param map Bytes32SetMap to list values
  /// @param key key of the values to be listed
  /// @param addr address of the values to be listed
  /// @return bytes32[] array of bytes32 values
  function values(Bytes32SetMap storage map,
                  Bytes32SetMapKey key,
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
    returns (Bytes32SetMapKey[] memory result)
  {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      result := array
    }
  }

  /// @notice Lists all keys for an Bytes32SetMap
  /// @param map Bytes32SetMap to list keys
  /// @return bytes32[] array of bytes32 values
  function keys(Bytes32SetMap storage map)
    internal
    view
    returns (Bytes32SetMapKey[] memory)
  {
    return _toKeys(map._keys.values());
  }

  /// @notice Adds a single value to an Bytes32SetMap
  /// @param map Bytes32SetMap to add the value to
  /// @param key key of the value to be added
  /// @param addr address of the value to be added
  /// @param value the value to be added
  /// @return true if the value was added to the set, that is if it was not
  ///         already present.
  function add(Bytes32SetMap storage map,
               Bytes32SetMapKey key,
               address addr,
               bytes32 value)
    internal
    returns (bool)
  {
    map._keys.add(Bytes32SetMapKey.unwrap(key));
    return _set(map, key, addr).add(value);
  }

  /// @notice Removes a single value from an Bytes32SetMap
  /// @param map Bytes32SetMap to remove the value from
  /// @param key key of the value to be removed
  /// @param addr address of the value to be removed
  /// @param value the value to be removed
  /// @return true if the value was removed from the set, that is if it was
  ///         present.
  function remove(Bytes32SetMap storage map,
                  Bytes32SetMapKey key,
                  address addr,
                  bytes32 value)
    internal
    returns (bool)
  {
    EnumerableSet.Bytes32Set storage set = _set(map, key, addr);
    bool success = set.remove(value);
    if (success && set.length() == 0) {
      map._keys.remove(Bytes32SetMapKey.unwrap(key));
    }
    return success;
  }

  /// @notice Clears values for a key.
  /// @dev Does not clear the addresses for the key, simply updates an index
  ///      such that the next time values for that key and address are
  ///      retrieved, it will reference a new EnumerableSet.
  /// @param map Bytes32SetMap for which to clear values
  /// @param key key for which to clear values
  function clear(Bytes32SetMap storage map, Bytes32SetMapKey key)
    internal
  {
    map._index[key]++;
  }

  type AddressSetMapKey is address;

  struct AddressSetMap {
    mapping(AddressSetMapKey =>
            mapping(uint8 =>
                    EnumerableSet.Bytes32Set)) _values;
    mapping(AddressSetMapKey => uint8) _index;
    EnumerableSet.AddressSet _keys;
    EnumerableSet.Bytes32Set _allValues;
  }

  /// @notice Returns the EnumerableSet.AddressSet containing the values for a
  ///         key in an AddressSetMap.
  /// @dev This is used internally to the library only. `.values()` should only
  ///      be called on its return value in a view/pure function.
  /// @param map AddressSetMap containing the set to be retrieved.
  /// @param key key of the set to be retrieved.
  /// @return bytes32[] array of bytes32 values.
  function _set(AddressSetMap storage map,
                AddressSetMapKey key)
    private
    view
    returns (EnumerableSet.Bytes32Set storage)
  {
    uint8 id = map._index[key];
    return map._values[key][id];
  }

  /// @notice Lists all values contained in an AddressSetMap, regardless of
  ///         the key.
  /// @param map AddressSetMap to list values
  /// @return bytes32[] array of bytes32 values
  function values(AddressSetMap storage map)
    internal
    view
    returns (bytes32[] memory)
  {
    return map._allValues.values();
  }

  /// @notice Lists all values for a key in an AddressSetMap
  /// @param map AddressSetMap to list values
  /// @param key key of the values to be listed
  /// @return bytes32[] array of bytes32 values
  function values(AddressSetMap storage map, AddressSetMapKey key)
    internal
    view
    returns (bytes32[] memory)
  {
    return _set(map, key).values();
  }

  function _toAddressSetMapKeys(address[] memory array)
    private
    pure
    returns (AddressSetMapKey[] memory result)
  {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      result := array
    }
  }

  /// @notice Lists all keys for an Bytes32SetMap.
  /// @param map AddressSetMap to list keys.
  /// @return bytes32[] array of bytes32 values.
  function keys(AddressSetMap storage map)
    internal
    view
    returns (AddressSetMapKey[] memory)
  {
    return _toAddressSetMapKeys(map._keys.values());
  }

  /// @notice Adds a single value to an AddressSetMap
  /// @param map AddressSetMap to add the value to.
  /// @param key key of the value to be added.
  /// @param value the value to be added.
  /// @return true if the value was added to the set, that is if it was not
  ///         already present.
  function add(AddressSetMap storage map,
               AddressSetMapKey key,
               bytes32 value)
    internal
    returns (bool)
  {
    map._keys.add(AddressSetMapKey.unwrap(key));
    map._allValues.add(value);
    return _set(map, key).add(value);
  }

  /// @notice Removes a single value from an AddressSetMap
  /// @param map AddressSetMap to remove the value from
  /// @param key key of the value to be removed
  /// @param value the value to be removed
  /// @return true if the value was removed from the set, that is if it was
  ///         present.
  function remove(AddressSetMap storage map,
                  AddressSetMapKey key,
                  bytes32 value)
    internal
    returns (bool)
  {
    EnumerableSet.Bytes32Set storage set = _set(map, key);
    bool success = set.remove(value);
    if (success && set.length() == 0) {
      map._keys.remove(AddressSetMapKey.unwrap(key));
    }
    map._allValues.remove(value);
    return success;
  }

  /// @notice Clears values for a key.
  /// @dev Updates an index such that the next time values for that key are
  ///      retrieved, it will reference a new EnumerableSet.
  /// @param map AddressSetMap for which to clear values
  /// @param key key for which to clear values
  function clear(AddressSetMap storage map, AddressSetMapKey key)
    internal
  {
    map._index[key]++;
  }
}