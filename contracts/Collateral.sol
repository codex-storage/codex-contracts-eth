// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Collateral {
  IERC20 private immutable token;
  Totals private totals;
  mapping(address => uint256) private balances;

  constructor(IERC20 _token) invariant {
    token = _token;
  }

  function balanceOf(address account) public view returns (uint256) {
    return balances[account];
  }

  function deposit(uint256 amount) public invariant {
    token.transferFrom(msg.sender, address(this), amount);
    totals.deposited += amount;
    balances[msg.sender] += amount;
    totals.balance += amount;
  }

  function withdraw() public invariant {
    uint256 amount = balances[msg.sender];
    balances[msg.sender] = 0;
    totals.balance -= amount;
    totals.withdrawn += amount;
    assert(token.transfer(msg.sender, amount));
  }

  modifier invariant() {
    Totals memory oldTotals = totals;
    _;
    assert(totals.deposited >= oldTotals.deposited);
    assert(totals.withdrawn >= oldTotals.withdrawn);
    assert(totals.deposited == totals.balance + totals.withdrawn);
  }

  struct Totals {
    uint256 balance;
    uint256 deposited;
    uint256 withdrawn;
  }
}
