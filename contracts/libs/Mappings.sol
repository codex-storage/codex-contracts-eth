// SPDX-License-Identifier: MIT
// heavily inspired by: https://bitbucket.org/rhitchens2/soliditystoragepatterns/src/master/OneToMany.sol
pragma solidity ^0.8.8;

import "./EnumerableSetExtensions.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

library Mappings {

  using EnumerableSet for EnumerableSet.Bytes32Set;
  using EnumerableSetExtensions for EnumerableSetExtensions.ClearableBytes32Set;

  type KeyId is bytes32;
  type ValueId is bytes32;

  struct Mapping {
    EnumerableSet.Bytes32Set _keyIds;
    EnumerableSet.Bytes32Set _valueIds;
    mapping(KeyId => Key) _keys;
    mapping(ValueId => Value) _values;
  }
  struct Key {
    EnumerableSetExtensions.ClearableBytes32Set _values;
  }

  struct Value {
    KeyId _keyId;
  }

  function exists(Mapping storage map, KeyId key)
    internal
    view
    returns (bool)
  {
    return map._keyIds.contains(KeyId.unwrap(key));
  }

  function exists(Mapping storage map, KeyId key, ValueId value)
    internal
    view
    returns (bool)
  {
    bytes32 val = ValueId.unwrap(value);
    return map._keys[key]._values.contains(val) &&
           map._valueIds.contains(val);
  }

  function keys(Mapping storage map)
    internal
    view
    returns(KeyId[] memory)
  {
    return _toKeyIds(map._keyIds.values());
  }

  function values(Mapping storage map,
                  KeyId key)
    internal
    view
    returns(ValueId[] memory)
  {
    require(exists(map, key), "key does not exist");
    return _toValueIds(map._keys[key]._values.values());
  }

  function count(Mapping storage map,
                      KeyId key)
    internal
    view
    returns(uint256)
  {
    require(exists(map, key), "key does not exist");
    return map._keys[key]._values.length();
  }

  function count(Mapping storage map)
    internal
    view
    returns(uint256)
  {
    return map._valueIds.length();
  }

  function insertKey(Mapping storage map, KeyId key)
    internal
    returns (bool)
  {
    require(!exists(map, key), "key already exists");
    return map._keyIds.add(KeyId.unwrap(key));
    // NOTE: map._keys[key]._values contains a default EnumerableSet.Bytes32Set
  }

  function insertValue(Mapping storage map, KeyId key, ValueId value)
    internal
    returns (bool success)
  {
    require(exists(map, key), "key does not exists");
    require(!exists(map, key, value), "value already exists");
    success = map._valueIds.add(ValueId.unwrap(value));
    assert (success); // value addition failure
    map._values[value]._keyId = key;

    success = map._keys[key]._values.add(ValueId.unwrap(value));
  }

  function insert(Mapping storage map, KeyId key, ValueId value)
    internal
    returns (bool success)
  {
    if (!exists(map, key)) {
      success = insertKey(map, key);
      assert (success); // key insertion failure
    }
    if (!exists(map, key, value)) {
      success = insertValue(map, key, value);
    }
  }

  function deleteKey(Mapping storage map, KeyId key)
    internal
    returns (bool success)
  {
    require(exists(map, key), "key does not exist");
    require(count(map, key) == 0, "references values");
    success = map._keyIds.remove(KeyId.unwrap(key)); // Note that this will fail automatically if the key doesn't exist
    assert(success); // key removal failure
    delete map._keys[key];
  }

  function deleteValue(Mapping storage map, KeyId key, ValueId value)
    internal
    returns (bool success)
  {
    require(exists(map, key), "key does not exist");
    require(exists(map, key, value), "value does not exist");

    success = map._valueIds.remove(ValueId.unwrap(value));
    assert (success); // value removal failure
    delete map._values[value];

    success = map._keys[key]._values.remove(ValueId.unwrap(value));

  }

  function clear(Mapping storage map, KeyId key)
    internal
    returns (bool success)
  {
    require(exists(map, key), "key does not exist");

    map._keys[key]._values.clear();
    success = deleteKey(map, key);
  }

  function _toKeyIds(bytes32[] memory array)
    private
    pure
    returns (KeyId[] memory result)
  {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      result := array
    }
  }

  function _toValueIds(bytes32[] memory array)
    private
    pure
    returns (ValueId[] memory result)
  {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      result := array
    }
  }

  function toKeyId(ValueId valueId) internal pure returns (KeyId) {
    return KeyId.wrap(ValueId.unwrap(valueId));
  }

  function toKeyId(address addr) internal pure returns (KeyId) {
    return KeyId.wrap(bytes32(uint(uint160(addr))));
  }
}
