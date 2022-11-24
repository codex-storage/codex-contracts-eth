// SPDX-License-Identifier: MIT
// heavily inspired by: https://bitbucket.org/rhitchens2/soliditystoragepatterns/src/master/GeneralizedCollection.sol
pragma solidity ^0.8.8;

import "./Debug.sol"; // DELETE ME

library Mappings {
  // first entity is called a "One"
  struct Key {
    // needed to delete a "One"
    uint256 _oneListPointer;
    // One has many "Many"
    bytes32[] _valueIds;
    mapping(bytes32 => uint256) _valueIdsIndex; // valueId => row of local _valueIds
    // more app data
  }

  // other entity is called a "Many"
  struct Value {
    // needed to delete a "Many"
    uint256 _valueIdsIndex;
    // many has exactly one "One"
    bytes32 _keyId;
    // add app fields
  }

  struct Mapping {
    mapping(bytes32 => Key) _keys;
    bytes32[] _keyIds;
    mapping(bytes32 => Value) _values;
    bytes32[] _valueIds;
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

  function getManyCount(Mapping storage db, bytes32 keyId)
    internal
    view
    returns(uint256 manyCount)
  {
    require(keyExists(db, keyId), "key does not exist");
    return _getValueIds(db, keyId).length;
  }

  function keyExists(Mapping storage db, bytes32 keyId)
    internal
    view
    returns(bool)
  {
    if(keyCount(db) == 0) return false;
    return db._keyIds[db._keys[keyId]._oneListPointer] == keyId;
  }

  function valueExists(Mapping storage db, bytes32 valueId)
    internal
    view
    returns(bool)
  {
    if(getManyCount(db) == 0) return false;
    uint256 row = db._values[valueId]._valueIdsIndex;
    bool retVal = db._valueIds[row] == valueId;
    return retVal;
  }

  function _getValueIds(Mapping storage db,
                        bytes32 keyId)
    internal
    view
    returns(bytes32[] storage)
  {
    require(keyExists(db, keyId), "key does not exist");
    return db._keys[keyId]._valueIds;
  }

  function getValueIds(Mapping storage db,
                       bytes32 keyId)
    internal
    view
    returns(bytes32[] storage)
  {
    require(keyExists(db, keyId), "key does not exist");
    return _getValueIds(db, keyId);
  }

  // Insert
  function insertKey(Mapping storage db, bytes32 keyId)
    internal
    returns(bool)
  {
    require(!keyExists(db, keyId), "key already exists"); // duplicate key prohibited

    db._keyIds.push(keyId);
    db._keys[keyId]._oneListPointer = keyCount(db) - 1;
    return true;
  }

  function insertValue(Mapping storage db, bytes32 keyId, bytes32 valueId)
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

  function insert(Mapping storage db, bytes32 keyId, bytes32 valueId)
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
  function deleteKey(Mapping storage db, bytes32 keyId)
    internal
    returns(bool)
  {
    require(keyExists(db, keyId), "key does not exist");
    require(_getValueIds(db, keyId).length == 0, "references manys"); // this would break referential integrity

    uint256 rowToDelete = db._keys[keyId]._oneListPointer;
    bytes32 keyToMove = db._keyIds[keyCount(db)-1];
    db._keyIds[rowToDelete] = keyToMove;
    db._keys[keyToMove]._oneListPointer = rowToDelete;
    db._keyIds.pop();
    delete db._keys[keyId];
    return true;
  }

  function deleteValue(Mapping storage db, bytes32 valueId)
    internal
    returns(bool)
  {
    require(valueExists(db, valueId), "value does not exist"); // non-existant key

    // delete from the Many table
    uint256 toDeleteIndex = db._values[valueId]._valueIdsIndex;

    uint256 lastIndex = getManyCount(db) - 1;

    if (lastIndex != toDeleteIndex) {
      bytes32 lastValue = db._valueIds[lastIndex];

      // Move the last value to the index where the value to delete is
      db._valueIds[toDeleteIndex] = lastValue;
      // Update the index for the moved value
      db._values[lastValue]._valueIdsIndex = toDeleteIndex; // Replace lastvalue's index to valueIndex
    }
    db._valueIds.pop();

    bytes32 keyId = db._values[valueId]._keyId;
    Key storage oneRow = db._keys[keyId];
    toDeleteIndex = oneRow._valueIdsIndex[valueId];
    lastIndex = oneRow._valueIds.length - 1;
    if (lastIndex != toDeleteIndex) {
      bytes32 lastValue = oneRow._valueIds[lastIndex];

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

  function clearValues(Mapping storage db, bytes32 keyId)
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
}
