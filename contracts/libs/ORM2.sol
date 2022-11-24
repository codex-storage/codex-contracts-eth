// SPDX-License-Identifier: MIT
// heavily inspired by: https://bitbucket.org/rhitchens2/soliditystoragepatterns/src/master/GeneralizedCollection.sol
pragma solidity ^0.8.8;

import "hardhat/console.sol";
import "./Debug.sol"; // DELETE ME

library ORM2 {
  // first entity is called a "One"
  struct OneStruct {
    // needed to delete a "One"
    uint _oneListPointer;
    // One has many "Many"
    bytes32[] _manyIds;
    mapping(bytes32 => uint) _manyIdPointers; // manyId => row of _manyIds
    // more app data
  }

  // other entity is called a "Many"
  struct ManyStruct {
    // needed to delete a "Many"
    uint _manyListPointer;
    // many has exactly one "One"
    bytes32 _oneId;
    // add app fields
  }

  struct OneToMany {
    mapping(bytes32 => OneStruct) _oneStructs;
    bytes32[] _oneList;
    mapping(bytes32 => ManyStruct) _manyStructs;
    bytes32[] _manyList;
  }

  function getOneCount(OneToMany storage db)
    internal
    view
    returns(uint)
  {
    return db._oneList.length;
  }

  function getManyCount(OneToMany storage db) internal view returns(uint) {
    return db._manyList.length;
  }

  function isOne(OneToMany storage db, bytes32 oneId)
    internal
    view
    returns(bool)
  {
    if(db._oneList.length == 0) return false;
    return db._oneList[db._oneStructs[oneId]._oneListPointer] == oneId;
  }

  function isMany(OneToMany storage db, bytes32 manyId)
    internal
    view
    returns(bool)
  {
    if(db._manyList.length == 0) return false;
    uint256 row = db._manyStructs[manyId]._manyListPointer;
    bool retVal = db._manyList[row] == manyId;
    return retVal;
  }

  // Iterate over a One's Many keys
  function getManyCount(OneToMany storage db, bytes32 oneId)
    internal
    view
    returns(uint manyCount)
  {
    require(isOne(db, oneId), "oneId does not exist");
    return db._oneStructs[oneId]._manyIds.length;
  }

  function getTotalManyCount(OneToMany storage db)
    internal
    view
    returns(uint manyCount)
  {
    return db._manyList.length;
  }

  function getManyKeyAtIndex(OneToMany storage db,
                             bytes32 oneId,
                             uint row)
    internal
    view
    returns(bytes32 manyKey)
  {
    require(isOne(db, oneId), "oneId does not exist");
    return db._oneStructs[oneId]._manyIds[row];
  }

  function getManyKeys(OneToMany storage db,
                       bytes32 oneId)
    internal
    view
    returns(bytes32[] storage manyKeys)
  {
    require(isOne(db, oneId), "oneId does not exist");
    return db._oneStructs[oneId]._manyIds;
  }

  // Insert
  function createOne(OneToMany storage db, bytes32 oneId)
    internal
    returns(bool)
  {
    require(!isOne(db, oneId), "oneId already exists"); // duplicate key prohibited

    db._oneList.push(oneId);
    db._oneStructs[oneId]._oneListPointer = getOneCount(db) - 1;
    return true;
  }

  function createMany(OneToMany storage db, bytes32 oneId, bytes32 manyId)
    internal
    returns(bool)
  {
    require(isOne(db, oneId), "oneId does not exist");
    require(!isMany(db, manyId), "manyId already exists"); // duplicate key prohibited

    ManyStruct storage manyRow = db._manyStructs[manyId];
    db._manyList.push(manyId);
    manyRow._manyListPointer = db._manyList.length - 1;
    manyRow._oneId = oneId; // each many has exactly one "One", so this is mandatory

    // We also maintain a list of "Many" that refer to the "One", so ...
    OneStruct storage oneRow = db._oneStructs[oneId];
    oneRow._manyIds.push(manyId);
    oneRow._manyIdPointers[manyId] = oneRow._manyIds.length - 1;
    return true;
  }

  // Delete
  function deleteOne(OneToMany storage db, bytes32 oneId)
    internal
    returns(bool)
  {
    require(isOne(db, oneId), "oneId does not exist");
    require(db._oneStructs[oneId]._manyIds.length == 0, "references manys"); // this would break referential integrity

    uint rowToDelete = db._oneStructs[oneId]._oneListPointer;
    bytes32 keyToMove = db._oneList[db._oneList.length-1];
    db._oneList[rowToDelete] = keyToMove;
    db._oneStructs[keyToMove]._oneListPointer = rowToDelete;
    db._oneList.pop();
    delete db._oneStructs[oneId];
    return true;
  }

  function deleteMany(OneToMany storage db, bytes32 manyId)
    internal
    returns(bool)
  {
    require(isMany(db, manyId), "manys do not exist"); // non-existant key

    console.log("deleting many, manyId: ");
    console.logBytes32(manyId);
    // delete from the Many table
    uint256 toDeleteIndex = db._manyStructs[manyId]._manyListPointer;

    uint256 lastIndex = db._manyList.length - 1;

    if (lastIndex != toDeleteIndex) {
      bytes32 lastValue = db._manyList[lastIndex];

      // Move the last value to the index where the value to delete is
      db._manyList[toDeleteIndex] = lastValue;
      // Update the index for the moved value
      db._manyStructs[lastValue]._manyListPointer = toDeleteIndex; // Replace lastvalue's index to valueIndex
    }
    db._manyList.pop();

    bytes32 oneId = db._manyStructs[manyId]._oneId;
    OneStruct storage oneRow = db._oneStructs[oneId];
    toDeleteIndex = oneRow._manyIdPointers[manyId];
    lastIndex = oneRow._manyIds.length - 1;
    if (lastIndex != toDeleteIndex) {
      bytes32 lastValue = oneRow._manyIds[lastIndex];

      // Move the last value to the index where the value to delete is
      oneRow._manyIds[toDeleteIndex] = lastValue;
      // Update the index for the moved value
      oneRow._manyIdPointers[lastValue] = toDeleteIndex; // Replace lastvalue's index to valueIndex
    }
    oneRow._manyIds.pop();
    delete oneRow._manyIdPointers[manyId];

    delete db._manyStructs[manyId];



    // uint rowToDelete = db._manyStructs[manyId]._manyListPointer;
    // console.log("row to delete: ", rowToDelete);
    // bytes32 keyToMove = db._manyList[db._manyList.length-1];
    // db._manyList[rowToDelete] = keyToMove;
    // uint rowToMove = db._manyStructs[keyToMove]._manyListPointer;
    // db._manyStructs[manyId]._manyListPointer = rowToDelete;
    // db._manyStructs[keyToMove]._manyListPointer = rowToMove;
    // db._manyList.pop();

    // we ALSO have to delete this key from the list in the ONE that was joined to this Many
    // bytes32 oneId = db._manyStructs[manyId]._oneId; // it's still there, just not dropped from index
    // rowToDelete = db._oneStructs[oneId]._manyIdPointers[manyId];
    // keyToMove = db._oneStructs[oneId]._manyIds[db._oneStructs[oneId]._manyIds.length-1];
    // db._oneStructs[oneId]._manyIds[rowToDelete] = keyToMove;
    // db._oneStructs[oneId]._manyIdPointers[keyToMove] = rowToDelete;
    // db._oneStructs[oneId]._manyIds.pop();
    return true;
  }



  function clearAllManys(OneToMany storage db, bytes32 oneId)
    internal
    returns(bool)
  {
    require(isOne(db, oneId), "oneId does not exist"); // non-existant key

    console.log("[clearAllMany] clearing all slotIds for requestId: ", Debug._toHex(oneId));
    console.log("[clearAllMany] BEFORE clearing");
    Debug._printTable(db);
    // delete db._manyList;
    delete db._oneStructs[oneId]._manyIds;
    bool result = deleteOne(db, oneId);
    console.log("[clearAllMany] AFTER clearing");
    Debug._printTable(db);
    return result;
  }
}
