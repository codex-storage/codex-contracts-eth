// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
  constructor() ERC20("TestToken", "TST") {}

  function mint(address[] memory holders, uint amount) public {
    for (uint i=0; i<holders.length; i++) {
      _mint(holders[i], amount);
    }
  }
}
