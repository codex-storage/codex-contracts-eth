// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./Mappings.sol";

import "hardhat/console.sol"; // DELETE ME

library Debug {
  using Mappings for Mappings.Mapping;
  using EnumerableSet for EnumerableSet.Bytes32Set;

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

  /// Prints contents of mapping, eg:
  /// |-----------------------------------------------------------------------------------------------------------------------------------------|
  /// | Key                                                                | Value                                                              |
  /// | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
  /// | 0x53D746B6815B837EFBA3C26A4330F442632016E3C91DE8AB01B96AC7DF46FB9C |                                                                    |
  /// |                                                                    | 0x79A8114055CCBC6FC73B36443E970318D607301126CD5C0B28952D7703079282 |
  /// | 0xB229F333E9967EC6B91027ADEB6BD4FAB57E56E4383737A2778CA9AE826E222D |                                                                    |
  /// |                                                                    | 0x7B7751C5591B3B6691A98FE57334D044BEDEC1F1748DF39637B2FD38B69C60E4 |
  /// |                                                                    | 0xA0F0D711FD9D1D71E328ED76D2B2B2F2F56C0FF17535FAA55087F7A52F048B51 |
  /// |                                                                    | 0x5248D5C5BC2A6D395C07F4A99E27D2BDD9F643C009BA59CA2C39AB5534F740E8 |
  /// |                                                                    | 0x002CAD0D878B163AD63EE9C098391A6F9443CD3D48916C4E63A2485F832BE57F |
  /// |_________________________________________________________________________________________________________________________________________|
  ///   Referenced values:    4
  ///   Unreferenced values:  1  (total values not deleted but are unused)
  ///   TOTAL Values:         5
  function _printTable(Mappings.Mapping storage db, string memory message)
    internal
    view
  {
    console.log(message);
    console.log("|-----------------------------------------------------------------------------------------------------------------------------------------|");
    console.log("| Key                                                                | Value                                                              |");
    console.log("| ------------------------------------------------------------------ | ------------------------------------------------------------------ |");
    uint256 referencedValues = 0;
    for(uint8 i = 0; i < db._keyIds.length(); i++) {
      bytes32 keyId = db._keyIds.at(i);
      console.log("|", _toHex(keyId), "|                                                                    |");

      Mappings.ValueId[] memory valueIds = db.values(Mappings.KeyId.wrap(keyId));
      for(uint8 j = 0; j < valueIds.length; j++) {
        Mappings.ValueId valueId = valueIds[j];
        console.log("|                                                                    |", _toHex(Mappings.ValueId.unwrap(valueId)), "|");
      }
      referencedValues += valueIds.length;
    }
    console.log("|_________________________________________________________________________________________________________________________________________|");
    console.log("  Referenced values:   ", referencedValues);
    uint256 totalValues = db.count();
    console.log("  Unreferenced values: ", totalValues - referencedValues, " (total values not deleted but are unused)");
    console.log("  TOTAL Values:        ", totalValues);
  }
}
