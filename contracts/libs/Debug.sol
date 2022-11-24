// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "./ORM2.sol";
import "hardhat/console.sol"; // DELETE ME

library Debug {
  function _toHex16 (bytes16 data) private pure returns (bytes32 result) {
    result = bytes32 (data) & 0xFFFFFFFFFFFFFFFF000000000000000000000000000000000000000000000000 |
              (bytes32 (data) & 0x0000000000000000FFFFFFFFFFFFFFFF00000000000000000000000000000000) >> 64;
    result = result & 0xFFFFFFFF000000000000000000000000FFFFFFFF000000000000000000000000 |
              (result & 0x00000000FFFFFFFF000000000000000000000000FFFFFFFF0000000000000000) >> 32;
    result = result & 0xFFFF000000000000FFFF000000000000FFFF000000000000FFFF000000000000 |
              (result & 0x0000FFFF000000000000FFFF000000000000FFFF000000000000FFFF00000000) >> 16;
    result = result & 0xFF000000FF000000FF000000FF000000FF000000FF000000FF000000FF000000 |
              (result & 0x00FF000000FF000000FF000000FF000000FF000000FF000000FF000000FF0000) >> 8;
    result = (result & 0xF000F000F000F000F000F000F000F000F000F000F000F000F000F000F000F000) >> 4 |
              (result & 0x0F000F000F000F000F000F000F000F000F000F000F000F000F000F000F000F00) >> 8;
    result = bytes32 (0x3030303030303030303030303030303030303030303030303030303030303030 +
              uint256 (result) +
              (uint256 (result) + 0x0606060606060606060606060606060606060606060606060606060606060606 >> 4 &
              0x0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F) * 7);
  }

  function _toHex (bytes32 data) internal pure returns (string memory) {
    return string (abi.encodePacked ("0x", _toHex16 (bytes16 (data)), _toHex16 (bytes16 (data << 128))));
  }

  // @notice Prints the contents of the one-to-many table
  //         Usage example (from ORM): Debug._printTable(db._oneList,
  //                                                     getManyKeys(db, oneId),
  //                                                     getTotalManyCount(db));
  // @dev Explain to a developer any extra details
  // @param oneList list of one ids
  // @param manyKeys list of one ids
  // @param totalManyCount list of one ids
  // function _printTable(bytes32[] storage oneList,
  //                      bytes32[] storage manyKeys,
  //                      uint256 totalManyCount)
  function _printTable(ORM2.OneToMany storage db)
    internal
    view
  {
    console.log("|-----------------------------------------------------------------------------------------------------------------------------------------|");
    console.log("| Key                                                                | Value                                                              |");
    console.log("| ------------------------------------------------------------------ | ------------------------------------------------------------------ |");
    for(uint8 i = 0; i < db._oneList.length; i++) {
      bytes32 oneId = db._oneList[i];
      console.log("|", _toHex(oneId), "|                                                                    |");

      bytes32[] storage manyKeys = ORM2.getManyKeys(db, oneId);
      for(uint8 j = 0; j < manyKeys.length; j++) {
        bytes32 slotId = manyKeys[j];
        console.log("|                                                                    |", _toHex(slotId), "|");
      }
    }
    console.log("|_________________________________________________________________________________________________________________________________________|");
    console.log("  TOTAL Values: ", ORM2.getTotalManyCount(db));
  }
}
