// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Collateral {
  IERC20 private immutable token;
  mapping(address => uint256) private balances;

  uint256 private totalDeposited;
  uint256 private totalBalance;

  constructor(IERC20 _token) invariant {
    token = _token;
  }

  function balanceOf(address account) public view returns (uint256) {
    return balances[account];
  }

  function deposit(uint256 amount) public invariant {
    token.transferFrom(msg.sender, address(this), amount);
    totalDeposited += amount;
    balances[msg.sender] += amount;
    totalBalance += amount;
  }

  modifier invariant() {
    _;
    assert(totalDeposited == totalBalance);
  }
}
