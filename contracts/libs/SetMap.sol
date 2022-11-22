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
    return _set(map, key, addr).remove(value);
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

  /// @notice Returns the length of values for a key and address.
  /// @param map Bytes32SetMap for which to get length of values
  /// @param key key for which to get the length of values
  /// @param addr address for which to get the length of values
  function length(Bytes32SetMap storage map,
                  Bytes32SetMapKey key,
                  address addr)
    internal
    view
    returns (uint256)
  {
    return _set(map, key, addr).length();
  }

  type AddressBytes32SetMapKey is address;

  struct AddressBytes32SetMap {
    mapping(AddressBytes32SetMapKey =>
            mapping(uint8 =>
                    EnumerableSet.Bytes32Set)) _values;
    mapping(AddressBytes32SetMapKey => uint8) _index;
  }

  /// @notice Returns the EnumerableSet.Bytes32Set containing the values for a
  ///         key in an AddressBytes32SetMap.
  /// @dev This is used internally to the library only. `.values()` should only
  ///      be called on its return value in a view/pure function.
  /// @param map AddressBytes32SetMap containing the set to be retrieved.
  /// @param key key of the set to be retrieved.
  /// @return bytes32[] array of bytes32 values.
  function _set(AddressBytes32SetMap storage map,
                AddressBytes32SetMapKey key)
    private
    view
    returns (EnumerableSet.Bytes32Set storage)
  {
    uint8 id = map._index[key];
    return map._values[key][id];
  }

  /// @notice Lists all values for a key in an AddressBytes32SetMap
  /// @param map AddressBytes32SetMap to list values
  /// @param key key of the values to be listed
  /// @return bytes32[] array of bytes32 values
  function values(AddressBytes32SetMap storage map, AddressBytes32SetMapKey key)
    internal
    view
    returns (bytes32[] memory)
  {
    return _set(map, key).values();
  }

  /// @notice Adds a single value to an AddressBytes32SetMap
  /// @param map AddressBytes32SetMap to add the value to.
  /// @param key key of the value to be added.
  /// @param value the value to be added.
  /// @return true if the value was added to the set, that is if it was not
  ///         already present.
  function add(AddressBytes32SetMap storage map,
               AddressBytes32SetMapKey key,
               bytes32 value)
    internal
    returns (bool)
  {
    return _set(map, key).add(value);
  }

  /// @notice Removes a single value from an AddressBytes32SetMap
  /// @param map AddressBytes32SetMap to remove the value from
  /// @param key key of the value to be removed
  /// @param value the value to be removed
  /// @return true if the value was removed from the set, that is if it was
  ///         present.
  function remove(AddressBytes32SetMap storage map,
                  AddressBytes32SetMapKey key,
                  bytes32 value)
    internal
    returns (bool)
  {
    return _set(map, key).remove(value);
  }

  /// @notice Clears values for a key.
  /// @dev Updates an index such that the next time values for that key are
  ///      retrieved, it will reference a new EnumerableSet.
  /// @param map AddressBytes32SetMap for which to clear values
  /// @param key key for which to clear values
  function clear(AddressBytes32SetMap storage map, AddressBytes32SetMapKey key)
    internal
  {
    map._index[key]++;
  }

  type Bytes32AddressSetMapKey is bytes32;

  struct Bytes32AddressSetMap {
    mapping(Bytes32AddressSetMapKey =>
            mapping(uint8 =>
                    EnumerableSet.AddressSet)) _values;
    mapping(Bytes32AddressSetMapKey => uint8) _index;
    EnumerableSet.Bytes32Set _keys;
  }

  /// @notice Returns the EnumerableSet.AddressSet containing the values for a
  ///         key in an Bytes32AddressSetMap.
  /// @dev This is used internally to the library only. `.values()` should only
  ///      be called on its return value in a view/pure function.
  /// @param map Bytes32AddressSetMap containing the set to be retrieved.
  /// @param key key of the set to be retrieved.
  /// @return bytes32[] array of bytes32 values.
  function _set(Bytes32AddressSetMap storage map,
                Bytes32AddressSetMapKey key)
    private
    view
    returns (EnumerableSet.AddressSet storage)
  {
    uint8 id = map._index[key];
    return map._values[key][id];
  }

  /// @notice Lists all keys for an Bytes32AddressSetMap
  /// @param map Bytes32AddressSetMap to list keys
  /// @return bytes32[] array of bytes32 values
  function keys(Bytes32AddressSetMap storage map)
    internal
    view
    returns (EnumerableSet.Bytes32Set storage)
  {
    return map._keys;
  }

  /// @notice Lists all values for a key in an Bytes32AddressSetMap
  /// @param map Bytes32AddressSetMap to list values
  /// @param key key of the values to be listed
  /// @return bytes32[] array of bytes32 values
  function values(Bytes32AddressSetMap storage map,
                  Bytes32AddressSetMapKey key)
    internal
    view
    returns (address[] memory)
  {
    return _set(map, key).values();
  }

  /// @notice Lists all values for a key in an Bytes32AddressSetMap
  /// @param map Bytes32AddressSetMap to list values
  /// @param key key of the values to be listed
  /// @return bytes32[] array of bytes32 values
  function contains(Bytes32AddressSetMap storage map,
                    Bytes32AddressSetMapKey key,
                    address addr)
    internal
    view
    returns (bool)
  {
    return _set(map, key).contains(addr);
  }

  /// @notice Returns the length of values for a key.
  /// @param map Bytes32AddressSetMap for which to get length
  /// @param key key for which to get the length of values
  function length(Bytes32AddressSetMap storage map,
                  Bytes32AddressSetMapKey key)
    internal
    view
    returns (uint256)
  {
    return _set(map, key).length();
  }

  /// @notice Adds a single value to an Bytes32AddressSetMap
  /// @param map Bytes32AddressSetMap to add the value to.
  /// @param key key of the value to be added.
  /// @param value the value to be added.
  /// @return true if the value was added to the set, that is if it was not
  ///         already present.
  function add(Bytes32AddressSetMap storage map,
               Bytes32AddressSetMapKey key,
               address value)
    internal
    returns (bool)
  {
    bool success = _set(map, key).add(value);
    if (success) {
      map._keys.add(Bytes32AddressSetMapKey.unwrap(key));
    }
    return success;
  }

  /// @notice Removes a single value from an Bytes32AddressSetMap
  /// @param map Bytes32AddressSetMap to remove the value from
  /// @param key key of the value to be removed
  /// @param value the value to be removed
  /// @return true if the value was removed from the set, that is if it was
  ///         present.
  function remove(Bytes32AddressSetMap storage map,
                  Bytes32AddressSetMapKey key,
                  address value)
    internal
    returns (bool)
  {
    EnumerableSet.AddressSet storage set = _set(map, key);
    bool success = _set(map, key).remove(value);
    if (success && set.length() == 0) {
      map._keys.remove(Bytes32AddressSetMapKey.unwrap(key));
    }
    return success;
  }

  /// @notice Clears values for a key.
  /// @dev Updates an index such that the next time values for that key are
  ///      retrieved, it will reference a new EnumerableSet.
  /// @param map Bytes32AddressSetMap for which to clear values
  /// @param key key for which to clear values
  function clear(Bytes32AddressSetMap storage map, Bytes32AddressSetMapKey key)
    internal
  {
    map._index[key]++;
  }
}