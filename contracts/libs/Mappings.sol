// SPDX-License-Identifier: MIT
// heavily inspired by: https://bitbucket.org/rhitchens2/soliditystoragepatterns/src/master/GeneralizedCollection.sol
pragma solidity ^0.8.8;

import "./Debug.sol"; // DELETE ME

library Mappings {
  type KeyId is bytes32;
  type ValueId is bytes32;

  // first entity is called a "One"
  struct Key {
    // needed to delete a "One"
    uint256 _oneListPointer;
    // One has many "Many"
    ValueId[] _valueIds;
    mapping(ValueId => uint256) _valueIdsIndex; // valueId => row of local _valueIds
    // more app data
  }

  // other entity is called a "Many"
  struct Value {
    // needed to delete a "Many"
    uint256 _valueIdsIndex;
    // many has exactly one "One"
    KeyId _keyId;
    // add app fields
  }

  struct Mapping {
    mapping(KeyId => Key) _keys;
    KeyId[] _keyIds;
    mapping(ValueId => Value) _values;
    ValueId[] _valueIds;
  }

  function keyCount(Mapping storage db)
    internal
    view
    returns(uint256)
  {
    return db._keyIds.length;
  }

  function getManyCount(Mapping storage db) internal view returns(uint256) {
    return db._valueIds.length;
  }

  function getManyCount(Mapping storage db, KeyId keyId)
    internal
    view
    returns(uint256 manyCount)
  {
    require(keyExists(db, keyId), "key does not exist");
    return _getValueIds(db, keyId).length;
  }

  function keyExists(Mapping storage db, KeyId keyId)
    internal
    view
    returns(bool)
  {
    if(keyCount(db) == 0) return false;
    return equals(db._keyIds[db._keys[keyId]._oneListPointer], keyId);
  }

  function valueExists(Mapping storage db, ValueId valueId)
    internal
    view
    returns(bool)
  {
    if(getManyCount(db) == 0) return false;
    uint256 row = db._values[valueId]._valueIdsIndex;
    bool retVal = equals(db._valueIds[row], valueId);
    return retVal;
  }

  function _getValueIds(Mapping storage db,
                        KeyId keyId)
    internal
    view
    returns(ValueId[] storage)
  {
    require(keyExists(db, keyId), "key does not exist");
    return db._keys[keyId]._valueIds;
  }

  function getValueIds(Mapping storage db,
                       KeyId keyId)
    internal
    view
    returns(ValueId[] storage)
  {
    require(keyExists(db, keyId), "key does not exist");
    return _getValueIds(db, keyId);
  }

  // Insert
  function insertKey(Mapping storage db, KeyId keyId)
    internal
    returns(bool)
  {
    require(!keyExists(db, keyId), "key already exists"); // duplicate key prohibited

    db._keyIds.push(keyId);
    db._keys[keyId]._oneListPointer = keyCount(db) - 1;
    return true;
  }

  function insertValue(Mapping storage db, KeyId keyId, ValueId valueId)
    internal
    returns(bool)
  {
    require(keyExists(db, keyId), "key does not exist");
    require(!valueExists(db, valueId), "value already exists"); // duplicate key prohibited

    Value storage value = db._values[valueId];
    db._valueIds.push(valueId);
    value._valueIdsIndex = getManyCount(db) - 1;
    value._keyId = keyId; // each many has exactly one "One", so this is mandatory

    // We also maintain a list of "Many" that refer to the "One", so ...
    Key storage key = db._keys[keyId];
    key._valueIds.push(valueId);
    key._valueIdsIndex[valueId] = key._valueIds.length - 1;
    return true;
  }

  function insert(Mapping storage db, KeyId keyId, ValueId valueId)
    internal
    returns(bool success)
  {
    if (!keyExists(db, keyId)) {
      success = insertKey(db, keyId);
      if (!success) {
        return false;
      }
    }
    if (!valueExists(db, valueId)) {
      success = insertValue(db, keyId, valueId);
    }
    return success;
  }


  // Delete
  function deleteKey(Mapping storage db, KeyId keyId)
    internal
    returns(bool)
  {
    require(keyExists(db, keyId), "key does not exist");
    require(_getValueIds(db, keyId).length == 0, "references manys"); // this would break referential integrity

    uint256 rowToDelete = db._keys[keyId]._oneListPointer;
    KeyId keyToMove = db._keyIds[keyCount(db)-1];
    db._keyIds[rowToDelete] = keyToMove;
    db._keys[keyToMove]._oneListPointer = rowToDelete;
    db._keyIds.pop();
    delete db._keys[keyId];
    return true;
  }

  function deleteValue(Mapping storage db, ValueId valueId)
    internal
    returns(bool)
  {
    require(valueExists(db, valueId), "value does not exist"); // non-existant key

    // delete from the Many table
    uint256 toDeleteIndex = db._values[valueId]._valueIdsIndex;

    uint256 lastIndex = getManyCount(db) - 1;

    if (lastIndex != toDeleteIndex) {
      ValueId lastValue = db._valueIds[lastIndex];

      // Move the last value to the index where the value to delete is
      db._valueIds[toDeleteIndex] = lastValue;
      // Update the index for the moved value
      db._values[lastValue]._valueIdsIndex = toDeleteIndex; // Replace lastvalue's index to valueIndex
    }
    db._valueIds.pop();

    KeyId keyId = db._values[valueId]._keyId;
    Key storage oneRow = db._keys[keyId];
    toDeleteIndex = oneRow._valueIdsIndex[valueId];
    lastIndex = oneRow._valueIds.length - 1;
    if (lastIndex != toDeleteIndex) {
      ValueId lastValue = oneRow._valueIds[lastIndex];

      // Move the last value to the index where the value to delete is
      oneRow._valueIds[toDeleteIndex] = lastValue;
      // Update the index for the moved value
      oneRow._valueIdsIndex[lastValue] = toDeleteIndex; // Replace lastvalue's index to valueIndex
    }
    oneRow._valueIds.pop();
    delete oneRow._valueIdsIndex[valueId];
    delete db._values[valueId];
    return true;
  }

  function clearValues(Mapping storage db, KeyId keyId)
    internal
    returns(bool)
  {
    require(keyExists(db, keyId), "key does not exist"); // non-existant key

    Debug._printTable(db, "[clearValues] BEFORE clearing");
    // delete db._valueIds;
    delete db._keys[keyId]._valueIds;
    bool result = deleteKey(db, keyId);
    Debug._printTable(db, "[clearValues] AFTER clearing");
    return result;
  }

  function equals(KeyId a, KeyId b) internal pure returns (bool) {
    return KeyId.unwrap(a) == KeyId.unwrap(b);
  }

  function equals(ValueId a, ValueId b) internal pure returns (bool) {
    return ValueId.unwrap(a) == ValueId.unwrap(b);
  }

  function toKeyId(address addr) internal pure returns (KeyId) {
    return KeyId.wrap(bytes32(uint(uint160(addr))));
  }

  // Useful in the case where a valueId is a foreign key
  function toKeyId(ValueId valueId) internal pure returns (KeyId) {
    return KeyId.wrap(ValueId.unwrap(valueId));
  }
}
