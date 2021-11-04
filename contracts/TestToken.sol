// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
  constructor(address[] memory holders) ERC20("TestToken", "TST") {
    for (uint i=0; i<holders.length; i++) {
      _mint(holders[i], 1000);
    }
  }
}
