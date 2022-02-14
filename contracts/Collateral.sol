// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Collateral {
  IERC20 private immutable token;
  mapping(address => uint256) private balances;

  constructor(IERC20 _token) {
    token = _token;
  }

  function balanceOf(address account) public view returns (uint256) {
    return balances[account];
  }

  function deposit(uint256 amount) public {
    token.transferFrom(msg.sender, address(this), amount);
    balances[msg.sender] += amount;
  }
}
